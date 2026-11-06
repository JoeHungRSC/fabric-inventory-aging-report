"""
ETL Pipeline for Monthly Fabric Stock & Liability Report
Processes:
1. Details.xlsx (Power BI Export)
2. raw_data/InventoryOnHand_RSC_20261023.xlsx (D365 Standard Costs)
3. raw_data/RM to Customer.xlsx (Customer Mapping)
4. raw_data/RSG UPH Arhaus Aged Detail Cover_FORM.xlsx (Demand & Reference)
5. D365_Inventory_Transactions_2026.xlsx (D365 InventTrans Production Consumption)
6. Order_Tracker_Data_26Oct.xlsx (Order Tracker FG Demand & Customer Orders)

Outputs:
- src/data/inventory_data.json (for React dashboard)
- public/inventory_data.json (for static fetch)
"""

import os
import json
import openpyxl
from datetime import datetime
from collections import defaultdict

def parse_date(val):
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    return str(val).split(" ")[0]

def get_aging_bucket(days):
    if days is None:
        return "Unknown"
    try:
        d = float(days)
    except:
        return "Unknown"

    if d < 90:
        return "0-3 months"
    elif d < 180:
        return "3-6 months"
    elif d < 360:
        return "6-12 months"
    elif d < 720:
        return "12-24 months"
    else:
        return "+24 months"

def main():
    import zipfile
    zip_path = "FW__PowerBI_-_monthly_fabric_stock_and_liability.zip"
    if not os.path.exists("raw_data") and os.path.exists(zip_path):
        print(f"Extracting {zip_path}...")
        os.makedirs("raw_data", exist_ok=True)
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall("raw_data")

    print("Step 1: Loading Standard Costs...")
    cost_map = {}
    cost_by_item = {}
    onhand_file = "raw_data/InventoryOnHand_RSC_20261023.xlsx"
    if os.path.exists(onhand_file):
        wb_c = openpyxl.load_workbook(onhand_file, data_only=True)
        ws_c = wb_c["Inventory OnHand"]
        headers_c = [ws_c.cell(1, c).value for c in range(1, ws_c.max_column + 1)]
        item_idx = headers_c.index("Item Id")
        cost_idx = headers_c.index("Standard Cost")
        batch_idx = headers_c.index("Batch")

        for r in range(2, ws_c.max_row + 1):
            it = ws_c.cell(r, item_idx + 1).value
            co = ws_c.cell(r, cost_idx + 1).value
            ba = ws_c.cell(r, batch_idx + 1).value
            if it and co is not None:
                try:
                    c_val = float(co)
                    cost_by_item[str(it).strip().upper()] = c_val
                    if ba:
                        cost_map[(str(it).strip().upper(), str(ba).strip().upper())] = c_val
                except:
                    pass

    ref_file = "raw_data/RSG UPH Arhaus Aged Detail Cover_FORM.xlsx"
    if os.path.exists(ref_file):
        wb_r = openpyxl.load_workbook(ref_file, data_only=True)
        ws_ar = wb_r["AR COVERS"]
        for r in range(3, ws_ar.max_row + 1):
            part = ws_ar.cell(r, 3).value
            cost = ws_ar.cell(r, 7).value
            if part and cost:
                try:
                    p_key = str(part).strip().upper()
                    if p_key not in cost_by_item:
                        cost_by_item[p_key] = float(cost)
                except:
                    pass

    print(f"Loaded {len(cost_by_item)} distinct item costs.")

    print("Step 2: Loading Customer Mapping...")
    customer_map = {}
    cust_file = "raw_data/RM to Customer.xlsx"
    if os.path.exists(cust_file):
        wb_cust = openpyxl.load_workbook(cust_file, data_only=True)
        ws_cust = wb_cust["Sheet1"]
        for r in range(3, ws_cust.max_row + 1):
            cust = ws_cust.cell(r, 2).value
            part = ws_cust.cell(r, 3).value
            if part and cust:
                customer_map[str(part).strip().upper()] = str(cust).strip()
    print(f"Loaded {len(customer_map)} customer mappings.")

    print("Step 3: Loading Demand & Allocation from Reference...")
    demand_by_part = {}
    monthly_demand = {}
    monthly_incoming = {}
    proj_months = ["2026-11", "2026-12", "2027-01", "2027-02"]

    if os.path.exists(ref_file):
        wb_ref = openpyxl.load_workbook(ref_file, data_only=True)
        ws_dem = wb_ref["Demand"]
        for r in range(3, ws_dem.max_row + 1):
            part = ws_dem.cell(r, 6).value
            req_date = ws_dem.cell(r, 8).value
            qty = ws_dem.cell(r, 9).value
            po_qty = ws_dem.cell(r, 14).value
            po_eta = ws_dem.cell(r, 21).value

            if part:
                p_key = str(part).strip().upper()

                if qty:
                    try:
                        q_val = float(qty)
                    except:
                        q_val = 0.0
                    demand_by_part[p_key] = demand_by_part.get(p_key, 0.0) + q_val

                    m_str = None
                    if req_date:
                        d_s = str(req_date).strip().upper()
                        for pm in proj_months:
                            y, m = pm.split("-")
                            month_abbr = datetime.strptime(m, "%m").strftime("%b").upper()
                            if month_abbr in d_s and y in d_s:
                                m_str = pm
                                break
                    if not m_str:
                        m_str = proj_months[0]

                    if p_key not in monthly_demand:
                        monthly_demand[p_key] = {pm: 0.0 for pm in proj_months}
                    monthly_demand[p_key][m_str] += q_val

                if po_qty:
                    try:
                        po_val = float(po_qty)
                    except:
                        po_val = 0.0
                    if po_val > 0:
                        m_inc_str = proj_months[0]
                        if po_eta:
                            eta_s = str(po_eta).strip().upper()
                            if "DEC" in eta_s: m_inc_str = "2026-12"
                            elif "JAN" in eta_s: m_inc_str = "2027-01"
                            elif "FEB" in eta_s: m_inc_str = "2027-02"
                            elif "NOV" in eta_s: m_inc_str = "2026-11"
                        if p_key not in monthly_incoming:
                            monthly_incoming[p_key] = {pm: 0.0 for pm in proj_months}
                        monthly_incoming[p_key][m_inc_str] += po_val

    print(f"Loaded demand for {len(demand_by_part)} distinct parts.")
    print(f"Loaded incoming POs for {len(monthly_incoming)} distinct parts.")

    print("Step 4: Loading Production Consumption from D365 Transactions...")
    months_order = [
        "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
        "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"
    ]
    month_labels = {
        "2026-02": "Feb 2026", "2026-03": "Mar 2026", "2026-04": "Apr 2026",
        "2026-05": "May 2026", "2026-06": "Jun 2026", "2026-07": "Jul 2026",
        "2026-08": "Aug 2026", "2026-09": "Sep 2026", "2026-10": "Oct 2026",
        "2026-11": "Nov 2026"
    }

    prod_consumption = defaultdict(lambda: {
        "consumed_qty": 0.0,
        "prod_orders_count": 0,
        "last_consumed_date": "",
        "monthly_consumed": {m: 0.0 for m in months_order}
    })

    tx_files = [
        "D365_Inventory_Transactions_2026.xlsx",
        "raw_data/D365_Inventory_Transactions_2026.xlsx",
        "Inventory transactions originator_639295475964065611.xlsx"
    ]
    tx_file = None
    for tf in tx_files:
        if os.path.exists(tf):
            tx_file = tf
            break

    if tx_file:
        print(f"Reading D365 transactions from {tx_file}...")
        wb_tx = openpyxl.load_workbook(tx_file, read_only=True)
        ws_tx = wb_tx[wb_tx.sheetnames[0]]
        for r in ws_tx.iter_rows(min_row=2, values_only=True):
            ref = str(r[3]).strip() if len(r) > 3 and r[3] else ""
            if ref != "Production line":
                continue
            iss = str(r[6]).strip() if len(r) > 6 and r[6] else ""
            if iss not in ("Sold", "Deducted"):
                continue

            it = str(r[0]).strip().upper() if len(r) > 0 and r[0] else ""
            try:
                qty = abs(float(r[7])) if len(r) > 7 and r[7] is not None else 0.0
            except:
                qty = 0.0

            dt_str = str(r[1])[:10] if len(r) > 1 and r[1] else ""
            m_str = dt_str[:7]

            prod_consumption[it]["consumed_qty"] += qty
            prod_consumption[it]["prod_orders_count"] += 1
            if dt_str > prod_consumption[it]["last_consumed_date"]:
                prod_consumption[it]["last_consumed_date"] = dt_str
            if m_str in prod_consumption[it]["monthly_consumed"]:
                prod_consumption[it]["monthly_consumed"][m_str] += qty

        print(f"Loaded production consumption for {len(prod_consumption)} distinct items from D365.")

    print("Step 5: Loading 2026 Order Tracker Sales Data...")
    ot_file = "Order_Tracker_Data_26Oct.xlsx"
    ot_sales = defaultdict(lambda: {
        "total_units": 0.0,
        "open_units": 0.0,
        "invoiced_units": 0.0,
        "orders_count": 0
    })

    if os.path.exists(ot_file):
        wb_ot = openpyxl.load_workbook(ot_file, read_only=True)
        ws_ot = wb_ot["Export"]
        for r in ws_ot.iter_rows(min_row=2, values_only=True):
            fab = str(r[20]).strip().upper() if len(r) > 20 and r[20] else ""
            if not fab.startswith(("LH-01", "LH-03", "LH-07")):
                continue
            qty = float(r[43]) if len(r) > 43 and r[43] is not None else 0.0
            st = str(r[48]).strip() if len(r) > 48 and r[48] else ""

            ot_sales[fab]["total_units"] += qty
            ot_sales[fab]["orders_count"] += 1
            if st == "Open order":
                ot_sales[fab]["open_units"] += qty
            elif st == "Invoiced":
                ot_sales[fab]["invoiced_units"] += qty

        print(f"Loaded Order Tracker sales for {len(ot_sales)} distinct fabrics.")

    print("Step 6: Processing Details.xlsx...")
    wb_d = openpyxl.load_workbook("Details.xlsx", read_only=True)
    ws_d = wb_d["Export"]

    records = []

    for row in ws_d.iter_rows(min_row=2, values_only=True):
        item = str(row[1]).strip() if row[1] else ""
        if not item.startswith(("LH-01", "LH-03", "LH-07")):
            continue

        prod_group = str(row[3]).strip() if row[3] else ""
        if prod_group not in ("RM_FABRIC", "RM_LEATHER", "RM_PU/PVC"):
            continue

        loc = str(row[5]).strip() if row[5] else ""
        loc_upper = loc.upper()
        if "DEFECT" in loc_upper or loc_upper == "UPH WIP":
            continue

        batch = str(row[0]).strip() if row[0] else ""
        item_upper = item.upper()
        batch_upper = batch.upper()

        try:
            qty = float(row[6]) if row[6] is not None else 0.0
        except:
            qty = 0.0

        try:
            reg_po = float(row[22]) if row[22] is not None else 0.0
        except:
            reg_po = 0.0

        try:
            avail = float(row[9]) if row[9] is not None else 0.0
        except:
            avail = 0.0

        try:
            reserved = float(row[8]) if row[8] is not None else 0.0
        except:
            reserved = 0.0

        cost = 0.0
        if "COM" in item_upper:
            cost = 0.0
        elif row[19] is not None and float(row[19]) > 0:
            cost = float(row[19])
        elif (item_upper, batch_upper) in cost_map and cost_map[(item_upper, batch_upper)] > 0:
            cost = cost_map[(item_upper, batch_upper)]
        elif item_upper in cost_by_item and cost_by_item[item_upper] > 0:
            cost = cost_by_item[item_upper]

        customer = customer_map.get(item_upper)
        if not customer:
            parts = item_upper.split("-")
            if len(parts) >= 3:
                base_part = f"{parts[0]}-{parts[1]}-{parts[2]}"
                customer = customer_map.get(base_part, "OTHERS")
            else:
                customer = "OTHERS"

        try:
            aging_days = int(row[21]) if row[21] is not None else 0
        except:
            aging_days = 0
        aging_bucket = get_aging_bucket(aging_days)

        total_cost = round(qty * cost, 2)
        import_duty = round(total_cost * 0.12, 2)
        vat = round((total_cost + import_duty) * 0.08, 2)
        total_after_tax = round(total_cost + import_duty + vat, 2)

        uom = "SqFt" if item.startswith("LH-01") else ("Meter" if item.startswith("LH-07") else "Yard")

        # Active status: Not aged (<=180d) AND active consumption in D365 or open orders
        has_consumption = (item_upper in prod_consumption and prod_consumption[item_upper]["consumed_qty"] > 0)
        has_order = (item_upper in ot_sales and ot_sales[item_upper]["total_units"] > 0)
        is_active = (aging_days <= 180) and (has_consumption or has_order)

        record = {
            "batch": batch,
            "item": item,
            "customer": customer,
            "product_group": str(row[3]).strip() if row[3] else "RM_FABRIC",
            "warehouse": str(row[4]).strip() if row[4] else "",
            "location": loc,
            "qty": round(qty, 2),
            "available": round(avail, 2),
            "reserved": round(reserved, 2),
            "registered_po": round(reg_po, 2),
            "description": str(row[12]).strip() if row[12] else "",
            "po": str(row[13]).strip() if row[13] else "",
            "receive_date": parse_date(row[15]),
            "mfg_date": parse_date(row[20]),
            "supplier": str(row[16]).strip() if row[16] else "",
            "standard_cost": round(cost, 2),
            "total_cost": total_cost,
            "import_duty": import_duty,
            "vat": vat,
            "total_after_tax": total_after_tax,
            "aging_days": aging_days,
            "aging_bucket": aging_bucket,
            "uom": uom,
            "is_com": "COM" in item_upper,
            "is_active": is_active
        }
        records.append(record)

    print(f"Processed {len(records)} inventory batch records.")

    # Step 7: Aggregate item-level projections
    item_aggregates = {}
    for r in records:
        it = r["item"].upper()
        if it not in item_aggregates:
            item_aggregates[it] = {
                "item": r["item"],
                "customer": r["customer"],
                "description": r["description"],
                "supplier": r["supplier"],
                "standard_cost": r["standard_cost"],
                "total_qty": 0.0,
                "total_cost": 0.0,
                "total_after_tax": 0.0,
                "registered_po": 0.0,
                "demand": demand_by_part.get(it, 0.0),
                "monthly_demand": monthly_demand.get(it, {pm: 0.0 for pm in proj_months}),
                "aging_qty": {
                    "0-3 months": 0.0,
                    "3-6 months": 0.0,
                    "6-12 months": 0.0,
                    "12-24 months": 0.0,
                    "+24 months": 0.0
                }
            }
        agg = item_aggregates[it]
        agg["total_qty"] += r["qty"]
        agg["total_cost"] += r["total_cost"]
        agg["total_after_tax"] += r["total_after_tax"]
        agg["registered_po"] += r["registered_po"]
        agg["aging_qty"][r["aging_bucket"]] += r["qty"]

    projections = []
    for it, agg in item_aggregates.items():
        start_stock = agg["total_qty"]
        m_inc = monthly_incoming.get(it, {pm: 0.0 for pm in proj_months}).copy()
        if agg["registered_po"] > sum(m_inc.values()):
            diff = agg["registered_po"] - sum(m_inc.values())
            m_inc[proj_months[0]] += diff

        total_inc = round(sum(m_inc.values()), 2)
        total_demand = round(sum(agg["monthly_demand"].values()), 2)

        balance = round(start_stock - total_demand, 2)
        free_stock = round(start_stock + total_inc - total_demand, 2)

        avg_weekly_demand = (total_demand / 17.3) if total_demand > 0 else 0.0
        aws = round(start_stock / avg_weekly_demand, 1) if avg_weekly_demand > 0 else 999.0

        uom = "SqFt" if agg["item"].startswith("LH-01") else ("Meter" if agg["item"].startswith("LH-07") else "Yard")
        free_stock_cost = round(max(0, free_stock) * agg["standard_cost"], 2)
        free_stock_tax = round(free_stock_cost * 1.2096, 2)

        status = "Surplus"
        if free_stock < 0:
            status = "Deficit"
        elif aws > 0 and aws < 4:
            status = "Low Buffer"
        elif aws >= 4 and aws <= 16:
            status = "Balanced"

        projections.append({
            "item": agg["item"],
            "customer": agg["customer"],
            "description": agg["description"],
            "supplier": agg["supplier"],
            "uom": uom,
            "standard_cost": agg["standard_cost"],
            "on_hand": round(start_stock, 2),
            "incoming": total_inc,
            "demand": total_demand,
            "balance": balance,
            "free_stock": free_stock,
            "free_stock_cost": free_stock_cost,
            "free_stock_tax": free_stock_tax,
            "aws": aws if aws < 999 else "No Demand",
            "status": status,
            "total_cost": round(agg["total_cost"], 2),
            "total_after_tax": round(agg["total_after_tax"], 2)
        })

    # Step 8: Build Active Covers Catalog & Velocity Trend
    active_items_map = {}
    for r in records:
        it = r["item"].upper()
        if r["is_active"]:
            if it not in active_items_map:
                consumed_data = prod_consumption.get(it, {
                    "consumed_qty": 0.0,
                    "prod_orders_count": 0,
                    "last_consumed_date": "",
                    "monthly_consumed": {m: 0.0 for m in months_order}
                })
                order_data = ot_sales.get(it, {
                    "total_units": 0.0,
                    "open_units": 0.0,
                    "invoiced_units": 0.0,
                    "orders_count": 0
                })

                active_items_map[it] = {
                    "item": r["item"],
                    "customer": r["customer"],
                    "description": r["description"],
                    "supplier": r["supplier"],
                    "product_group": r["product_group"],
                    "uom": r["uom"],
                    "standard_cost": r["standard_cost"],
                    "on_hand_qty": 0.0,
                    "batches_count": 0,
                    "total_cost": 0.0,
                    "total_after_tax": 0.0,
                    "consumed_qty_2026": round(consumed_data["consumed_qty"], 1),
                    "prod_orders_count": consumed_data["prod_orders_count"],
                    "last_consumed_date": consumed_data["last_consumed_date"],
                    "order_units_2026": round(order_data["total_units"], 1),
                    "open_units_2026": round(order_data["open_units"], 1),
                    "invoiced_units_2026": round(order_data["invoiced_units"], 1),
                    "monthly_consumed": {m: round(consumed_data["monthly_consumed"][m], 1) for m in months_order}
                }
            ai = active_items_map[it]
            ai["on_hand_qty"] += r["qty"]
            ai["batches_count"] += 1
            ai["total_cost"] += r["total_cost"]
            ai["total_after_tax"] += r["total_after_tax"]

    active_covers = []
    low_buffer_count = 0
    balanced_count = 0
    high_buffer_count = 0

    for it, d in active_items_map.items():
        # Consumption-based runway (preferred) or order-based runway
        effective_demand = d["consumed_qty_2026"] if d["consumed_qty_2026"] > 0 else d["order_units_2026"]
        avg_wk = (effective_demand / 39.0) if effective_demand > 0 else 0.0
        wos = round(d["on_hand_qty"] / avg_wk, 1) if avg_wk > 0 else 999.0

        status = "High Buffer"
        if wos < 4.0:
            status = "Low Buffer"
            low_buffer_count += 1
        elif wos <= 16.0:
            status = "Balanced"
            balanced_count += 1
        else:
            high_buffer_count += 1

        active_covers.append({
            "item": d["item"],
            "customer": d["customer"],
            "description": d["description"],
            "supplier": d["supplier"],
            "product_group": d["product_group"],
            "uom": d["uom"],
            "standard_cost": d["standard_cost"],
            "on_hand_qty": round(d["on_hand_qty"], 2),
            "batches_count": d["batches_count"],
            "total_cost": round(d["total_cost"], 2),
            "total_after_tax": round(d["total_after_tax"], 2),
            "consumed_qty_2026": d["consumed_qty_2026"],
            "prod_orders_count": d["prod_orders_count"],
            "last_consumed_date": d["last_consumed_date"] or "No D365 Pick",
            "order_units_2026": d["order_units_2026"],
            "open_units_2026": d["open_units_2026"],
            "invoiced_units_2026": d["invoiced_units_2026"],
            "monthly_consumed": d["monthly_consumed"],
            "avg_weekly_demand": round(avg_wk, 1),
            "weeks_of_supply": wos if wos < 999 else "No Orders",
            "status": status
        })

    active_covers.sort(key=lambda x: x["total_cost"], reverse=True)

    monthly_velocity = []
    for m in months_order[:-1]: # Feb to Oct (Nov is in flight)
        m_consumed = sum(d["monthly_consumed"][m] for d in active_covers)
        active_skus = sum(1 for d in active_covers if d["monthly_consumed"][m] > 0)
        monthly_velocity.append({
            "month": m,
            "label": month_labels[m],
            "units": round(m_consumed, 0),
            "active_skus": active_skus
        })

    total_qty = sum(r["qty"] for r in records)
    total_cost = sum(r["total_cost"] for r in records)
    total_duty = sum(r["import_duty"] for r in records)
    total_vat = sum(r["vat"] for r in records)
    total_after_tax = sum(r["total_after_tax"] for r in records)

    active_cost_total = sum(d["total_cost"] for d in active_covers)
    active_tax_total = sum(d["total_after_tax"] for d in active_covers)

    aging_summary = {}
    for bucket in ["0-3 months", "3-6 months", "6-12 months", "12-24 months", "+24 months"]:
        b_records = [r for r in records if r["aging_bucket"] == bucket]
        b_qty = sum(r["qty"] for r in b_records)
        b_cost = sum(r["total_cost"] for r in b_records)
        b_duty = sum(r["import_duty"] for r in b_records)
        b_vat = sum(r["vat"] for r in b_records)
        b_tax = sum(r["total_after_tax"] for r in b_records)
        aging_summary[bucket] = {
            "count": len(b_records),
            "qty": round(b_qty, 2),
            "cost": round(b_cost, 2),
            "import_duty": round(b_duty, 2),
            "vat": round(b_vat, 2),
            "total_after_tax": round(b_tax, 2),
            "qty_pct": round(b_qty / total_qty * 100, 1) if total_qty > 0 else 0,
            "cost_pct": round(b_cost / total_cost * 100, 1) if total_cost > 0 else 0
        }

    customers = sorted(list(set(r["customer"] for r in records)))
    warehouses = sorted(list(set(r["warehouse"] for r in records if r["warehouse"])))
    product_groups = sorted(list(set(r["product_group"] for r in records)))

    dataset = {
        "metadata": {
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_batches": len(records),
            "distinct_items": len(item_aggregates),
            "projection_months": ["Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027"],
            "totals": {
                "qty": round(total_qty, 2),
                "total_cost": round(total_cost, 2),
                "import_duty": round(total_duty, 2),
                "vat": round(total_vat, 2),
                "total_after_tax": round(total_after_tax, 2),
                "aged_over_180d_cost": round(sum(aging_summary[b]["cost"] for b in ["6-12 months", "12-24 months", "+24 months"]), 2),
                "aged_over_180d_tax": round(sum(aging_summary[b]["total_after_tax"] for b in ["6-12 months", "12-24 months", "+24 months"]), 2)
            },
            "active_covers_summary": {
                "total_items": len(active_covers),
                "total_batches": sum(d["batches_count"] for d in active_covers),
                "total_on_hand_qty": round(sum(d["on_hand_qty"] for d in active_covers), 2),
                "total_cost": round(active_cost_total, 2),
                "total_tax": round(active_tax_total, 2),
                "cost_pct": round(active_cost_total / total_cost * 100, 1) if total_cost > 0 else 0.0,
                "low_buffer_count": low_buffer_count,
                "balanced_count": balanced_count,
                "high_buffer_count": high_buffer_count,
                "monthly_velocity": monthly_velocity
            },
            "aging_summary": aging_summary,
            "customers": customers,
            "warehouses": warehouses,
            "product_groups": product_groups
        },
        "records": records,
        "projections": projections,
        "active_covers": active_covers
    }

    os.makedirs("src/data", exist_ok=True)
    os.makedirs("public", exist_ok=True)

    with open("src/data/inventory_data.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False)

    with open("public/inventory_data.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False)

    print("Success: Wrote inventory_data.json to src/data/ and public/")
    print(f"Total Batches: {len(records)}, Active Batches: {sum(d['batches_count'] for d in active_covers)}")
    print(f"Total Valuation: ${total_cost:,.2f}, Active Valuation: ${active_cost_total:,.2f} ({active_cost_total/total_cost*100:.1f}%)")

if __name__ == "__main__":
    main()
