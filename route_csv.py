"""Named route CSV v2, with a compatibility boundary for the existing renderer."""
import csv
import io
import json
import re
from pathlib import Path

FIELDS = ["形式版", "行種別", "停留所名", "表示名", "英語名", "読み仮名", "緯度", "経度",
          "整理券1", "整理券2", "整理券3", "整理券4", "整理券5", "整理券6",
          "広告", "始発", "予備1", "予備2", "予備3", "放送ファイル", "停留所番号",
          "系統名", "路線表示", "終点名", "終点読み", "営業所", "放送フォルダ", "事業者名", "事業者読み", "系統読み"]
STOP_FIELDS = {"停留所名":0,"表示名":1,"英語名":2,"広告":9,"始発":10,"予備1":11,"予備2":12,"予備3":13,
               "放送ファイル":14,"停留所番号":15,"緯度":16,"経度":17,"読み仮名":19}
STOP_FIELDS.update({f"整理券{i+1}":i+3 for i in range(6)})

def value(row, index):
    return row[index] if index < len(row) else ""

def compact(name):
    return re.sub(r"[\s　]+", "", name or "")

def read_rows(text):
    raw = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    raw = [r for r in raw if any(r)]
    if not raw or "形式版" not in raw[0]:
        return raw
    records = [dict(zip(raw[0], row)) for row in raw[1:]]
    if any(r.get("形式版") != "2" for r in records):
        raise ValueError("Unsupported route CSV version")
    routes = [r for r in records if r.get("行種別") == "路線"]
    if len(routes) != 1:
        raise ValueError("Route CSV requires exactly one 路線 row")
    route = routes[0]
    rows = [[""] * 23]
    for record in records:
        if record.get("行種別") != "停留所":
            continue
        row = [""] * 23
        for key, index in STOP_FIELDS.items():
            row[index] = record.get(key, "")
        rows.append(row)
    metadata = [""] * 23
    metadata[1] = route.get("営業所", "")
    metadata[14] = route.get("放送フォルダ") or route.get("系統名", "")
    metadata[15] = route.get("路線表示", "")
    for index, key in ((19,"終点読み"),(20,"事業者読み"),(21,"系統読み"),(22,"事業者名")):
        metadata[index] = route.get(key, "")
    rows.append(metadata)
    return rows

def reading_dictionary():
    path = Path(__file__).with_name("tts-readings.json")
    return {compact(k):v for k,v in json.loads(path.read_text(encoding="utf-8")).items()} if path.exists() else {}

def write_rows(path, rows, readings=None, company="", stop_readings=None, depot=None):
    readings = readings if readings is not None else reading_dictionary()
    stop_readings = stop_readings or {}
    metadata = rows[-1]
    last = rows[-2]
    def reading(row):
        return value(row,19) or stop_readings.get(compact(value(row,0)), "") or readings.get(compact(value(row,0)), "") or readings.get(compact(value(row,1)), "")
    depot = depot if depot is not None else (value(metadata,1) if value(metadata,1).endswith("営業所") else "")
    system = value(metadata,14)
    route = {key:"" for key in FIELDS}
    route.update({"形式版":"2","行種別":"路線","系統名":system,"路線表示":value(metadata,15),
                  "終点名":value(last,0),"終点読み":value(metadata,19) or reading(last),"営業所":depot,
                  "放送フォルダ":system if any(value(row,14) for row in rows[1:-1]) else "",
                  "事業者名":value(metadata,22) or company,
                  "事業者読み":value(metadata,20) or ("ちゅうおうばす" if "中央" in company else ""),
                  "系統読み":value(metadata,21)})
    with Path(path).open("w",encoding="utf-8-sig",newline="") as file:
        writer = csv.DictWriter(file,fieldnames=FIELDS,lineterminator="\n")
        writer.writeheader();writer.writerow(route)
        for row in rows[1:-1]:
            record = {key:value(row,index) for key,index in STOP_FIELDS.items()}
            record.update({"形式版":"2","行種別":"停留所","読み仮名":reading(row)})
            writer.writerow(record)
