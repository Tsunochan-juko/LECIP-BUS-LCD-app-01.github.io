#!/usr/bin/env python3
"""Convert a GTFS Schedule ZIP into this simulator's 16-column route CSVs.

Usage:
    python gtfs_to_unchin_csv.py hokkaido_chuo.zip -o converted --fare 240

Coordinates and zone-based boarding fares are exported.
Column 19 stores the complete ticket-fare list as JSON; columns 4-9 retain
the first six fares for compatibility. Ticket numbers are inferred from zones.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Iterable


HEADER = [
    "停留場１", "停留場２", "Bus_stop", "1", "2", "3", "4", "5", "6",
    "広告", "始発", "空1", "空1", "空1", "放送", "停留場番号", "緯度", "経度", "整理券運賃JSON",
]
FARE_COLUMNS = (3, 4, 5, 6, 7, 8)


def read_gtfs_table(archive: zipfile.ZipFile, table_name: str) -> list[dict[str, str]]:
    """Read a GTFS CSV at the archive root or under a single enclosing folder."""
    expected = table_name.lower()
    matches = [
        name for name in archive.namelist()
        if Path(name).name.lower() == expected and not name.endswith("/")
    ]
    if not matches:
        return []
    # Prefer the shallowest matching table if the ZIP contains documentation copies.
    member = min(matches, key=lambda name: (name.count("/"), name))
    with archive.open(member) as binary:
        text = (line.decode("utf-8-sig", errors="replace") for line in binary)
        return list(csv.DictReader(text))


def translations_for(rows: Iterable[dict[str, str]], table: str, field: str, language: str) -> dict[str, str]:
    translations: dict[str, str] = {}
    for row in rows:
        if row.get("table_name") != table or row.get("field_name") != field:
            continue
        if (row.get("language") or "").lower().split("-")[0] != language.lower().split("-")[0]:
            continue
        key = row.get("record_id") or row.get("field_value") or ""
        value = row.get("translation") or ""
        if key and value:
            translations[key] = value
    return translations


def clean_stop_name(value: str) -> str:
    """Drop parenthesized qualifiers from displayed/spoken stop names."""
    while re.search(r"\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］", value):
        value = re.sub(r"\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］", "", value)
    return re.sub(r"[ \t]+", " ", value).strip()


def safe_filename(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" ._")
    return value[:100] or "route"


def parse_route_fares(
    fare_attributes: list[dict[str, str]],
    fare_rules: list[dict[str, str]],
    route_id: str,
    default_fare: int,
) -> int:
    """Use a single unambiguous route fare; otherwise use --fare."""
    by_id = {row.get("fare_id", ""): row for row in fare_attributes if row.get("fare_id")}
    matching_ids = {
        row.get("fare_id", "") for row in fare_rules
        if row.get("route_id") == route_id and row.get("fare_id")
    }
    prices: set[int] = set()
    for fare_id in matching_ids:
        try:
            prices.add(round(float(by_id[fare_id]["price"])))
        except (KeyError, ValueError):
            continue
    if len(prices) == 1:
        return prices.pop()
    return default_fare



class ZoneFares:
    """Resolve OD rules with route-specific overrides and contains-zone conditions."""
    def __init__(self, attributes, rules):
        self.prices = {}
        for row in attributes:
            try:
                if row.get("currency_type") == "JPY":
                    self.prices[row["fare_id"]] = round(float(row["price"]))
            except (KeyError, ValueError):
                pass
        self.od = defaultdict(set)
        self.contains = defaultdict(set)
        self.contains_routes = defaultdict(set)
        self.has_data = bool(rules)
        for row in rules:
            fid = row.get("fare_id", "")
            if fid not in self.prices:
                continue
            rid = row.get("route_id", "")
            if row.get("contains_id"):
                self.contains[fid].add(row["contains_id"])
                self.contains_routes[fid].add(rid)
            else:
                self.od[(rid, row.get("origin_id", ""), row.get("destination_id", ""))].add(fid)

    def price(self, route, origin, destination, visited):
        candidates = set()
        for rid in (route, ""):
            matches = set()
            for a, b in ((origin, destination), (origin, ""), ("", destination), ("", "")):
                matches.update(self.od.get((rid, a, b), ()))
            for fid, zones in self.contains.items():
                if rid in self.contains_routes[fid] and zones.issubset(visited):
                    matches.add(fid)
            if matches:
                candidates = matches
                break
        prices = {self.prices[fid] for fid in candidates}
        return next(iter(prices)) if len(prices) == 1 else None

    def apply(self, rows, ordered_ids, stops, route, default_fare):
        valid = [sid for sid in ordered_ids if sid in stops]
        zones = [stops[sid].get("zone_id", "") for sid in valid]
        starts = []
        for index, row in enumerate(rows[1:-1]):
            zone = zones[index]
            if index == 0 or zone != zones[index - 1]:
                starts.append(index)
            entries = []
            # A boarding group becomes relevant after leaving its first stop.
            for number, start in enumerate(starts, 1):
                if start >= index and index > 0:
                    continue
                value = self.price(route, zones[start], zone, set(zones[start:index + 1]))
                if value is None:
                    value = default_fare if not self.has_data else ""
                entries.append({"number": number, "fare": value})
            row[3:9] = [str(e["fare"]) for e in entries[:6]] + [""] * max(0, 6 - len(entries))
            row.append(json.dumps(entries, ensure_ascii=False, separators=(",", ":")))
        rows[-1].append("")


def make_csv_rows(
    route: dict[str, str],
    trip: dict[str, str],
    stop_times: list[dict[str, str]],
    stops: dict[str, dict[str, str]],
    stop_translations: dict[str, str],
    trip_headsigns: dict[str, str],
    fare: int,
) -> tuple[list[list[str]], str]:
    def sequence(row: dict[str, str]) -> tuple[int, str]:
        try:
            return int(row.get("stop_sequence", "0")), row.get("stop_id", "")
        except ValueError:
            return 0, row.get("stop_id", "")

    ordered = sorted(stop_times, key=sequence)
    route_rows: list[list[str]] = [HEADER]
    stop_names: list[str] = []
    for stop_time in ordered:
        stop_id = stop_time.get("stop_id", "")
        stop = stops.get(stop_id)
        if not stop:
            continue
        japanese_name = (stop.get("stop_name") or stop_id).strip()
        english_name = (stop_translations.get(stop_id) or stop_translations.get(japanese_name) or japanese_name).strip()
        row = [""] * 18
        japanese_name = clean_stop_name(japanese_name)
        english_name = clean_stop_name(english_name)
        row[0] = japanese_name
        row[1] = japanese_name
        row[2] = english_name
        row[FARE_COLUMNS[0]] = str(fare)
        row[15] = str(len(stop_names))
        row[16] = (stop.get("stop_lat") or "").strip()
        row[17] = (stop.get("stop_lon") or "").strip()
        route_rows.append(row)
        stop_names.append(japanese_name)

    if not stop_names:
        return [], ""
    short_name = (route.get("route_short_name") or route.get("route_long_name") or route.get("route_id") or "route").strip()
    # Display the actual terminal stop name; GTFS headsign may contain a phonetic katakana label.
    destination = clean_stop_name(stop_names[-1])
    system_match = re.match(r"^([^0-9０-９]*[0-9０-９]+(?:[-・][0-9０-９]+)?)", short_name)
    display_system = system_match.group(1) if system_match else short_name
    route_label = f"{display_system}◆{stop_names[0]}→{destination}"
    terminal = [""] * 18
    terminal[1] = stop_names[-1]
    terminal[14] = short_name
    terminal[15] = route_label
    route_rows.append(terminal)
    return route_rows, destination


def convert(
    zip_path: Path,
    output_dir: Path,
    default_fare: int = 210,
    language: str = "en",
    include_non_bus: bool = False,
) -> int:
    if not zipfile.is_zipfile(zip_path):
        raise ValueError(f"Not a readable ZIP file: {zip_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        routes = read_gtfs_table(archive, "routes.txt")
        trips = read_gtfs_table(archive, "trips.txt")
        stop_times = read_gtfs_table(archive, "stop_times.txt")
        stop_rows = read_gtfs_table(archive, "stops.txt")
        if not (routes and trips and stop_times and stop_rows):
            missing = [
                name for name, rows in (("routes.txt", routes), ("trips.txt", trips),
                                        ("stop_times.txt", stop_times), ("stops.txt", stop_rows))
                if not rows
            ]
            raise ValueError("Required GTFS tables are missing or empty: " + ", ".join(missing))

        translations = read_gtfs_table(archive, "translations.txt")
        stop_translations = translations_for(translations, "stops", "stop_name", language)
        trip_headsigns = translations_for(translations, "trips", "trip_headsign", "ja")
        stops = {row.get("stop_id", ""): row for row in stop_rows if row.get("stop_id")}
        route_by_id = {row.get("route_id", ""): row for row in routes if row.get("route_id")}
        times_by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
        for row in stop_times:
            if row.get("trip_id"):
                times_by_trip[row["trip_id"]].append(row)
        fare_attributes = read_gtfs_table(archive, "fare_attributes.txt")
        fare_rules = read_gtfs_table(archive, "fare_rules.txt")
        zone_fares = ZoneFares(fare_attributes, fare_rules)

        # Collapse service variants with the same ordered stops and destination.
        patterns: dict[tuple[str, str, tuple[str, ...], str], dict[str, str]] = {}
        for trip in trips:
            route_id = trip.get("route_id", "")
            route = route_by_id.get(route_id)
            if not route:
                continue
            route_type = (route.get("route_type") or "").strip()
            is_bus = route_type == "3" or (route_type.isdigit() and 700 <= int(route_type) < 800)
            if not include_non_bus and not is_bus:
                continue
            trip_id = trip.get("trip_id", "")
            times = times_by_trip.get(trip_id, [])
            if not times:
                continue
            ordered_ids = tuple(row.get("stop_id", "") for row in sorted(times, key=lambda row: (int(row.get("stop_sequence") or 0), row.get("stop_id", ""))))
            headsign = trip_headsigns.get(trip_id) or trip.get("trip_headsign", "")
            key = (route_id, trip.get("direction_id", "0"), ordered_ids, headsign)
            patterns.setdefault(key, trip)

        counts_by_route: dict[str, int] = defaultdict(int)
        counts_by_filename: dict[str, int] = defaultdict(int)
        written = 0
        for (route_id, direction_id, _stop_ids, _headsign), trip in patterns.items():
            route = route_by_id[route_id]
            route_fare = parse_route_fares(fare_attributes, fare_rules, route_id, default_fare)
            rows, _destination = make_csv_rows(
                route, trip, times_by_trip[trip["trip_id"]], stops,
                stop_translations, trip_headsigns, route_fare,
            )
            if not rows:
                continue
            zone_fares.apply(rows, _stop_ids, stops, route_id, default_fare)
            counts_by_route[route_id] += 1
            number = counts_by_route[route_id]
            route_system = rows[-1][14] or route.get("route_short_name") or route.get("route_long_name") or route_id or "route"
            origin = clean_stop_name(rows[1][0] or rows[1][1])
            destination = clean_stop_name(rows[-2][0] or rows[-2][1])
            filename_base = safe_filename(f"{route_system}_{origin}-{destination}")
            counts_by_filename[filename_base] += 1
            variant = counts_by_filename[filename_base]
            suffix = f"_別経路{variant:02d}" if variant > 1 else ""
            filename = f"{filename_base}{suffix}.csv"
            with (output_dir / filename).open("w", encoding="utf-8", newline="") as file:
                csv.writer(file, lineterminator="\n").writerows(rows)
            written += 1
    return written


def convert_input(input_path: Path, output_dir: Path, default_fare: int, language: str, include_non_bus: bool) -> int:
    """Convert one ZIP, or every ZIP in a directory into company subfolders."""
    if input_path.is_dir():
        archives = sorted(input_path.glob("*.zip"))
        if not archives:
            raise ValueError(f"No .zip files found in folder: {input_path}")
        total = 0
        for archive_path in archives:
            company_output = output_dir / safe_filename(archive_path.stem)
            count = convert(archive_path, company_output, default_fare, language, include_non_bus)
            print(f"{archive_path.name}: {count} route patterns -> {company_output}")
            total += count
        write_route_manifest(output_dir)
        return total
    total = convert(input_path, output_dir, default_fare, language, include_non_bus)
    write_route_manifest(output_dir)
    return total


def write_route_manifest(routes_dir: Path) -> None:
    """Write the static route list consumed by the GitHub Pages version."""
    entries = []
    previous_file = routes_dir / "index.json"
    previous_entries = json.loads(previous_file.read_text(encoding="utf-8")).get("routes", []) if previous_file.exists() else []
    previous_names = {entry["path"]: entry.get("name", "") for entry in previous_entries}
    previous_by_path = {entry["path"]: entry for entry in previous_entries}
    for csv_path in sorted(routes_dir.rglob("*.csv")):
        relative = csv_path.relative_to(routes_dir).as_posix()
        parent = csv_path.parent.relative_to(routes_dir).as_posix()
        with csv_path.open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.reader(source))
        if len(rows) >= 3:
            system = rows[-1][14] if len(rows[-1]) > 14 else ""
            origin = clean_stop_name(rows[1][0] or rows[1][1])
            destination = clean_stop_name(rows[-2][0] or rows[-2][1])
            label = f"{system}｜{origin}－{destination}" if system else f"{origin}－{destination}"
            variant = re.search(r"_別経路(\d+)$", csv_path.stem)
            if variant:
                label += f"（別経路{variant.group(1)}）"
        else:
            label = csv_path.stem
        previous_name = previous_names.get(relative, "")
        company = previous_name.split(" / ")[0] if " / " in previous_name else (parent if parent != "." else "")
        route_name = f"{company} / {label}" if company else label
        if relative.startswith("archive/"):
            entry = dict(previous_by_path.get(relative, {}))
            entry.update({"name": entry.get("name", route_name), "path": relative, "category": "archive"})
            entries.append(entry)
        else:
            entries.append({"name": route_name, "path": relative})
    manifest = {"routes": entries}
    (routes_dir / "index.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="GTFS ZIPまたはZIP入りフォルダを運賃表示器シミュレーター用CSVへ変換します")
    parser.add_argument("input", type=Path, help="GTFS ZIPファイル、またはZIPをまとめたフォルダ")
    parser.add_argument("-o", "--output", type=Path, default=Path("converted_routes"), help="出力先フォルダ (既定: converted_routes)")
    parser.add_argument("--fare", type=int, default=210, help="GTFSから運賃を決められない場合の均一運賃 (既定: 210)")
    parser.add_argument("--language", default="en", help="停留所名翻訳に使う言語コード (既定: en)")
    parser.add_argument("--all-route-types", action="store_true", help="バス以外のGTFS route_typeも出力する")
    args = parser.parse_args()
    if args.fare < 0:
        parser.error("--fare must be zero or greater")
    try:
        count = convert_input(args.input, args.output, args.fare, args.language, args.all_route_types)
    except (OSError, zipfile.BadZipFile, ValueError, KeyError) as error:
        print(f"変換できませんでした: {error}", file=sys.stderr)
        return 1
    print(f"{count} 個の路線パターンを {args.output.resolve()} に出力しました")
    print("停留所座標と区間運賃を出力しました。整理券番号はゾーン順の推定です。運賃データがある場合、特定できない区間は空欄になります。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
