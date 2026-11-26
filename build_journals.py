#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MyScholar 学术期刊分级数据构建脚本
功能：读取工作目录下的多来源期刊名单，清洗、去重、补全别名，生成：
  - my_journals.json          （公开版，不含 JCR 影响因子/分区与中科院分区）
  - my_journals.private.json  （私有版，包含全部数据集）
  - my_journals.min.json      （精简公开版，仅保留 core 和 custom 分组）
  - build_report.md           （构建统计与抽样报告）
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd

# ===================== 1. 数据集元数据定义（沿用 myscholar.user.js 配色与结构） =====================
DATASET_META: dict[str, dict[str, str]] = {
    "cas_up":   {"name": "SCI (中科院升级版)", "group": "core",   "color": "#d93025"},
    "cas_top":  {"name": "SCI中科院TOP期刊",  "group": "core",   "color": "#c2185b"},
    "cas_warn": {"name": "SCI (中科院预警)",   "group": "core",   "color": "#1f1f1f"},
    "sci_if":   {"name": "SCI影响因子",        "group": "core",   "color": "#188038"},
    "jcr":      {"name": "SCI (Clarivate-JCR)","group": "core",   "color": "#1a73e8"},
    "ei":       {"name": "EI",                 "group": "core",   "color": "#00838f"},
    "ccf":      {"name": "中国计算机学会(CCF)", "group": "core",   "color": "#e37400"},
    "pku":      {"name": "北大中文核心",       "group": "core",   "color": "#b71c1c"},
    "cssci":    {"name": "CSSCI南大核心",      "group": "core",   "color": "#ad1457"},
    "cscd":     {"name": "中国科学引文(CSCD)", "group": "core",   "color": "#2e7d32"},
    "cstpcd":   {"name": "中国科技核心",       "group": "core",   "color": "#0277bd"},
    "ssci":     {"name": "SSCI (Clarivate)",   "group": "more",   "color": "#3949ab"},
    "ahci":     {"name": "A&HCI检索",          "group": "more",   "color": "#5e35b1"},
    "esci":     {"name": "ESCI (Clarivate)",   "group": "more",   "color": "#546e7a"},
    "ft50":     {"name": "FT50",               "group": "more",   "color": "#00695c"},
    "utd24":    {"name": "UTD24",              "group": "more",   "color": "#00796b"},
    "fms":      {"name": "FMS",                "group": "more",   "color": "#00897b"},
    "abs":      {"name": "AJG (原ABS)",        "group": "more",   "color": "#6d4c41"},
    "sjr":      {"name": "SCImago (SJR)",      "group": "more",   "color": "#455a64"},
}

# 有版权限制的数据集：仅写入私有版 my_journals.private.json，公开版自动剔除
PRIVATE_ONLY_IDS = {"cas_up", "cas_top", "sci_if", "jcr"}

# 常见无意义表头/占位值
INVALID_NAMES = {"", "nan", "none", "null", "n/a", "-", "--", "title", "journal", "journal name", "期刊名", "刊名", "期刊名称", "刊物名称"}


# ===================== 2. 清洗与归一化工具 =====================
def clean_text(val: Any) -> str:
    """去首尾空白、全角转半角、合并多余空格，过滤 NaN。"""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s or s.lower() in {"nan", "none", "null", "n/a"}:
        return ""
    # 全角转半角（NFKC 同时处理 \u3000 全角空格与全角英数符号）
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize(s: str) -> str:
    """与 myscholar.user.js 保持完全一致的归一化逻辑。"""
    if not s:
        return ""
    s = s.replace("\u00a0", " ").lower()
    s = s.replace("&", " and ")
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9\u4e00-\u9fa5\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def has_cjk(s: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fa5]", s))


def rank_score(label: str) -> float:
    """
    评估同一数据集内标签的优先级分数（越大越优），用于去重冲突时保留更高等级。
    """
    if not label:
        return 0.0
    u = label.upper().strip()

    # 影响因子 IF:12.3
    m_if = re.match(r"^IF[:：\s]*([0-9]+(?:\.[0-9]+)?)$", u)
    if m_if:
        return 100.0 + float(m_if.group(1))

    # 中科院 / SCI升级版 1~4 区
    m_cas = re.search(r"(?:中科院|升级版|SJR)\D*([1-4])\s*区", label, re.IGNORECASE)
    if m_cas:
        return 50.0 - int(m_cas.group(1)) * 10.0

    # JCR / SJR / SSCI Q1~Q4
    m_q = re.search(r"\bQ([1-4])\b", u)
    if m_q:
        return 50.0 - int(m_q.group(1)) * 10.0

    # ABS / AJG 4*, 4, 3, 2, 1
    if "4*" in u:
        return 55.0
    m_abs = re.search(r"ABS\s*([1-4])", u)
    if m_abs:
        return 10.0 * int(m_abs.group(1))

    # CCF / FMS / 高校分级：T1 > T2 > T3，A+ > A > B > C > D
    if re.search(r"(?:^|[-_\s])T1$", u):
        return 45.0
    if re.search(r"(?:^|[-_\s])T2$", u):
        return 35.0
    if re.search(r"(?:^|[-_\s])T3$", u):
        return 25.0
    if re.search(r"(?:^|[-_\s])A\+$", u):
        return 48.0
    if re.search(r"(?:^|[-_\s])A$", u):
        return 40.0
    if re.search(r"(?:^|[-_\s])B$", u):
        return 30.0
    if re.search(r"(?:^|[-_\s])C$", u):
        return 20.0
    if re.search(r"(?:^|[-_\s])D$", u):
        return 10.0

    # 数字分级（如 1类 / 一类 / A1 / A2）
    m_num = re.search(r"([1-5])", u)
    if m_num:
        return 20.0 - int(m_num.group(1))

    # 普通收录标签（如 EI / SCIE / 北大核心）
    return 5.0


# ===================== 3. 数据集构建器（含去重、冲突统计与别名写入） =====================
class DatasetBuilder:
    def __init__(self, ds_id: str, meta: dict[str, str]):
        self.ds_id = ds_id
        self.meta = meta
        # norm_key -> (display_name, label)
        self.primary: dict[str, tuple[str, str]] = {}
        # 待写入别名列表: [(alias_raw, label)]
        self.pending_aliases: list[tuple[str, str]] = []
        self.conflicts: int = 0
        self.anomalies: int = 0
        self.alias_added: int = 0
        self.alias_skipped_conflict: int = 0

    def add(self, name: str, label: str, aliases: list[str] | None = None) -> None:
        name = clean_text(name)
        label = clean_text(label)
        if not name or not label or name.lower() in INVALID_NAMES:
            self.anomalies += 1
            return

        nk = normalize(name)
        if not nk:
            self.anomalies += 1
            return

        if nk in self.primary:
            old_name, old_label = self.primary[nk]
            if old_label != label:
                self.conflicts += 1
                if rank_score(label) > rank_score(old_label):
                    self.primary[nk] = (name, label)
        else:
            self.primary[nk] = (name, label)

        if aliases:
            for al in aliases:
                al_clean = clean_text(al)
                if al_clean and al_clean.lower() not in INVALID_NAMES:
                    self.pending_aliases.append((al_clean, label))

    def finalize_items(self) -> dict[str, str]:
        """先写入全部全称，再写入不与任何全称冲突的别名（简称/ISSN）。"""
        items: dict[str, str] = {}
        for _, (display_name, label) in self.primary.items():
            items[display_name] = label

        alias_map: dict[str, tuple[str, str]] = {}
        for al_raw, label in self.pending_aliases:
            nk = normalize(al_raw)
            if not nk:
                continue
            # 别名与其他期刊全称冲突时不写入
            if nk in self.primary:
                self.alias_skipped_conflict += 1
                continue
            if nk in alias_map:
                _, old_label = alias_map[nk]
                if rank_score(label) > rank_score(old_label):
                    alias_map[nk] = (al_raw, label)
            else:
                alias_map[nk] = (al_raw, label)

        for _, (al_display, label) in alias_map.items():
            items[al_display] = label
            self.alias_added += 1

        return items


# ===================== 4. 通用表格读取与表头自动识别 =====================
def read_table(path: Path) -> pd.DataFrame:
    """自动识别 CSV/TSV/Excel 编码与分隔符。"""
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, dtype=str)

    # 文本表格：尝试常见编码与自动分隔符
    encodings = ["utf-8-sig", "utf-8", "gb18030", "latin1"]
    last_err: Exception | None = None
    for enc in encodings:
        try:
            with path.open("r", encoding=enc) as f:
                sample = f.read(4096)
            # 简单判断分隔符
            sep = ";" if sample.count(";") > sample.count(",") and sample.count(";") > sample.count("\t") else (
                "\t" if sample.count("\t") > sample.count(",") else ","
            )
            return pd.read_csv(path, sep=sep, dtype=str, encoding=enc, on_bad_lines="skip")
        except Exception as e:
            last_err = e
    raise RuntimeError(f"无法读取表格 {path.name}: {last_err}")


def find_col(columns: list[str], candidates: list[str]) -> str | None:
    """按优先级模糊匹配列名（忽略大小写与空格/下划线）。"""
    norm_cols = {re.sub(r"[\s_\-]+", "", str(c).strip().lower()): c for c in columns}
    # 先精确匹配
    for cand in candidates:
        key = re.sub(r"[\s_\-]+", "", cand.strip().lower())
        if key in norm_cols:
            return norm_cols[key]
    # 再包含匹配
    for cand in candidates:
        key = re.sub(r"[\s_\-]+", "", cand.strip().lower())
        for nc, orig in norm_cols.items():
            if key in nc:
                return orig
    return None


def parse_issn_aliases(raw: Any) -> list[str]:
    """拆分 ISSN / eISSN 字段为标准化别名列表（如 0028-0836）。"""
    s = clean_text(raw)
    if not s:
        return []
    out: list[str] = []
    for part in re.split(r"[,;/\s]+", s):
        p = part.strip().upper()
        if re.match(r"^\d{4}-?\d{3}[\dX]$", p):
            if "-" not in p:
                p = f"{p[:4]}-{p[4:]}"
            out.append(p)
    return out


# ===================== 5. 各来源解析函数 =====================
def load_scimago(path: Path, builder: DatasetBuilder) -> None:
    df = read_table(path)
    title_col = find_col(list(df.columns), ["Title", "Journal", "Journal Title", "Source title"])
    q_col = find_col(list(df.columns), ["SJR Best Quartile", "Quartile", "SJR Quartile"])
    cites_col = find_col(list(df.columns), ["Citations / Doc. (2years)", "Cites / Doc. (2years)"])
    issn_col = find_col(list(df.columns), ["Issn", "ISSN"])
    if not title_col or not q_col:
        raise ValueError(f"无法识别 SCImago 列名，当前表头: {list(df.columns)}")

    q_map = {"Q1": "1区", "Q2": "2区", "Q3": "3区", "Q4": "4区"}
    for _, row in df.iterrows():
        title = clean_text(row.get(title_col))
        q = clean_text(row.get(q_col)).upper()
        if not title or q not in q_map:
            if title and q in {"-", ""}:
                continue
            builder.anomalies += 1
            continue
        label = f"SJR {q_map[q]}"
        if cites_col:
            raw_c = clean_text(row.get(cites_col)).replace(",", ".")
            try:
                cv = float(raw_c)
                if cv > 0:
                    label = f"SJR {q_map[q]} · 均引{cv:.1f}"
            except ValueError:
                pass
        aliases = parse_issn_aliases(row.get(issn_col)) if issn_col else []
        builder.add(title, label, aliases)


def load_plain_list(path: Path, builder: DatasetBuilder, default_label: str, title_candidates: list[str] | None = None) -> None:
    """读取纯收录类名单（支持 .txt / .csv / .xlsx）。"""
    if path.suffix.lower() == ".txt":
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            s = clean_text(line)
            if not s or s.startswith("#"):
                continue
            # 支持 "刊名\t标签" 两列格式，否则使用 default_label
            if "\t" in s:
                parts = [p.strip() for p in s.split("\t") if p.strip()]
                builder.add(parts[0], parts[1] if len(parts) > 1 else default_label)
            else:
                builder.add(s, default_label)
        return

    df = read_table(path)
    cands = title_candidates or ["Journal title", "Source title", "Title", "Journal", "期刊名", "刊名", "期刊名称", "刊物名称"]
    title_col = find_col(list(df.columns), cands) or df.columns[0]
    rank_col = find_col(list(df.columns), ["Rank", "Level", "Grade", "等级", "级别", "分类", "分区"])
    issn_col = find_col(list(df.columns), ["ISSN", "eISSN", "Print ISSN", "Online ISSN"])

    for _, row in df.iterrows():
        title = clean_text(row.get(title_col))
        if not title:
            continue
        label = clean_text(row.get(rank_col)) if rank_col else ""
        if not label:
            label = default_label
        aliases = parse_issn_aliases(row.get(issn_col)) if issn_col else []
        builder.add(title, label, aliases)


def load_ccf(path: Path, builder: DatasetBuilder) -> None:
    """
    解析 CCF 推荐目录（支持 JSON 和 Excel/CSV）。
    规则：国际期刊写 CCF-A，中文刊写 CCF中文-A，会议写 CCF-A；同时写入简称和 ISSN 别名。
    """
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        records: list[dict[str, Any]] = []
        if isinstance(data, dict):
            for key in ("journals", "conferences", "chinese_journals", "items"):
                if isinstance(data.get(key), list):
                    for item in data[key]:
                        if isinstance(item, dict):
                            item = dict(item)
                            item.setdefault("_source_group", key)
                            records.append(item)
        elif isinstance(data, list):
            records = [r for r in data if isinstance(r, dict)]

        for rec in records:
            name = clean_text(rec.get("name") or rec.get("title") or rec.get("full_name") or rec.get("刊物名称"))
            rank = clean_text(rec.get("rank") or rec.get("level") or rec.get("级别")).upper()
            abbr = clean_text(rec.get("abbr") or rec.get("short") or rec.get("简称"))
            issn = rec.get("issn") or rec.get("ISSN")
            if not name or not rank:
                builder.anomalies += 1
                continue
            rank = rank.replace("CCF-", "").replace("CCF", "").strip()
            is_zh = has_cjk(name) or rec.get("_source_group") == "chinese_journals" or str(rec.get("language", "")).strip() == "中文"
            label = f"CCF中文-{rank}" if is_zh else f"CCF-{rank}"
            aliases = []
            if abbr:
                aliases.append(abbr)
            aliases.extend(parse_issn_aliases(issn))
            builder.add(name, label, aliases)
        return

    df = read_table(path)
    name_col = find_col(list(df.columns), ["刊物全称", "全称", "刊物名称", "期刊名", "name", "title", "full name"])
    abbr_col = find_col(list(df.columns), ["刊物简称", "简称", "abbr", "short", "acronym"])
    rank_col = find_col(list(df.columns), ["级别", "等级", "rank", "level", "ccf"])
    issn_col = find_col(list(df.columns), ["ISSN", "eISSN"])
    if not name_col or not rank_col:
        raise ValueError(f"无法识别 CCF 表格列名，当前表头: {list(df.columns)}")

    for _, row in df.iterrows():
        name = clean_text(row.get(name_col))
        rank = clean_text(row.get(rank_col)).upper().replace("CCF-", "").replace("CCF", "").strip()
        if not name or not rank:
            builder.anomalies += 1
            continue
        label = f"CCF中文-{rank}" if has_cjk(name) else f"CCF-{rank}"
        aliases = []
        if abbr_col:
            abbr = clean_text(row.get(abbr_col))
            if abbr:
                aliases.append(abbr)
        if issn_col:
            aliases.extend(parse_issn_aliases(row.get(issn_col)))
        builder.add(name, label, aliases)


def load_jcr(path: Path, jcr_builder: DatasetBuilder, if_builder: DatasetBuilder) -> None:
    """解析 JCR 导出表：生成 JCR 分区（JCR Q1）与影响因子（IF:12.3）。"""
    df = read_table(path)
    title_col = find_col(list(df.columns), ["Journal name", "Full Journal Title", "Journal", "Title", "刊名", "期刊名"])
    abbr_col = find_col(list(df.columns), ["JCR Abbreviation", "Abbreviated Journal Title", "Abbreviation", "ISO Abbreviation", "简称"])
    q_col = find_col(list(df.columns), ["JIF Quartile", "Quartile", "JCR Quartile", "分区"])
    if_col = find_col(list(df.columns), ["2024 JIF", "2023 JIF", "JIF", "Impact Factor", "Journal Impact Factor", "IF", "影响因子"])
    issn_col = find_col(list(df.columns), ["ISSN", "Print ISSN"])
    eissn_col = find_col(list(df.columns), ["eISSN", "Electronic ISSN"])
    if not title_col:
        raise ValueError(f"无法识别 JCR 刊名列，当前表头: {list(df.columns)}")

    for _, row in df.iterrows():
        title = clean_text(row.get(title_col))
        if not title:
            continue
        aliases: list[str] = []
        if abbr_col:
            abbr = clean_text(row.get(abbr_col))
            if abbr:
                aliases.append(abbr)
        if issn_col:
            aliases.extend(parse_issn_aliases(row.get(issn_col)))
        if eissn_col:
            aliases.extend(parse_issn_aliases(row.get(eissn_col)))

        if q_col:
            q = clean_text(row.get(q_col)).upper()
            m = re.search(r"Q[1-4]", q)
            if m:
                jcr_builder.add(title, f"JCR {m.group(0)}", aliases)

        if if_col:
            raw_if = clean_text(row.get(if_col)).replace("<", "")
            try:
                val = float(raw_if)
                if val > 0:
                    if_builder.add(title, f"IF:{val:.1f}", aliases)
            except ValueError:
                pass


def load_cas(path: Path, cas_up: DatasetBuilder, cas_top: DatasetBuilder) -> None:
    """解析中科院期刊分区表（如用户自行提供 cas.xlsx / cas.csv）。"""
    df = read_table(path)
    title_col = find_col(list(df.columns), ["Journal", "Title", "期刊名", "刊名"])
    q_col = find_col(list(df.columns), ["大类分区", "分区", "Division", "Quartile"])
    top_col = find_col(list(df.columns), ["Top", "TOP", "是否Top", "是否TOP"])
    issn_col = find_col(list(df.columns), ["ISSN", "eISSN"])
    if not title_col or not q_col:
        raise ValueError(f"无法识别中科院分区表列名，当前表头: {list(df.columns)}")

    for _, row in df.iterrows():
        title = clean_text(row.get(title_col))
        if not title:
            continue
        aliases = parse_issn_aliases(row.get(issn_col)) if issn_col else []
        q_raw = clean_text(row.get(q_col))
        m = re.search(r"([1-4])", q_raw)
        if m:
            cas_up.add(title, f"中科院{m.group(1)}区", aliases)
        if top_col:
            top_val = clean_text(row.get(top_col)).upper()
            if top_val in {"是", "Y", "YES", "TRUE", "1", "TOP"}:
                cas_top.add(title, "TOP", aliases)


def load_abs(path: Path, builder: DatasetBuilder) -> None:
    """解析 ABS / AJG 商科期刊分级表（兼容 AJG2021.xlsx 等官方/开源表格）。"""
    df = read_table(path)
    title_col = find_col(list(df.columns), ["Journal Title", "Title", "Journal", "期刊名"])
    rank_col = find_col(list(df.columns), ["AJG 2024", "AJG 2021", "AJG 2018", "AJG", "ABS", "Rank", "Rating", "等级"])
    issn_col = find_col(list(df.columns), ["ISSN", "Print ISSN", "eISSN"])
    if not title_col or not rank_col:
        raise ValueError(f"无法识别 ABS/AJG 列名，当前表头: {list(df.columns)}")

    for _, row in df.iterrows():
        title = clean_text(row.get(title_col))
        rank = clean_text(row.get(rank_col)).upper()
        if not title or not rank:
            continue
        rank = rank.replace("ABS", "").replace("AJG", "").strip()
        if rank not in {"4*", "4", "3", "2", "1"}:
            continue
        aliases = parse_issn_aliases(row.get(issn_col)) if issn_col else []
        builder.add(title, f"ABS {rank}", aliases)


def load_ccf_cn(path: Path, builder: DatasetBuilder) -> None:
    """解析 CCF 中文高质量科技期刊分级目录 JSON（如 ccf_cn.json）。"""
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    venues = data.get("venues", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    for rec in venues:
        if not isinstance(rec, dict):
            continue
        name = clean_text(rec.get("fullName") or rec.get("name") or rec.get("abbr"))
        rank = clean_text(rec.get("rank")).upper()
        if not name or not rank:
            continue
        # 若中文别名存在，优先将中文刊名作为主键，英文名与其他别名作为别名
        raw_aliases = [clean_text(a) for a in (rec.get("aliases") or []) if clean_text(a)]
        zh_names = [a for a in raw_aliases if has_cjk(a) and not re.search(r"[A-Za-z]{4,}", a)]
        primary_name = zh_names[0] if zh_names else name
        is_zh = has_cjk(primary_name) or str(rec.get("language", "")).strip() == "中文"
        label = f"CCF中文-{rank}" if is_zh else f"CCF-{rank}"
        aliases = [a for a in ([name, clean_text(rec.get("abbr"))] + raw_aliases) if a and a != primary_name]
        builder.add(primary_name, label, aliases)


def load_cn_core_bundle(
    path: Path,
    pku_builder: DatasetBuilder,
    cstpcd_builder: DatasetBuilder,
    cssci_builder: DatasetBuilder,
) -> None:
    """解析开源中文核心合集 CSV（cn_core_raw.csv），按类别分流到北大核心/科技核心/CSSCI。"""
    df = read_table(path)
    name_col = find_col(list(df.columns), ["name", "title", "期刊名", "刊名"])
    type_col = find_col(list(df.columns), ["type", "category", "核心类别", "类别"])
    if not name_col or not type_col:
        return
    for _, row in df.iterrows():
        name = clean_text(row.get(name_col))
        t = clean_text(row.get(type_col))
        if not name or not t:
            continue
        if t == "中文核心":
            pku_builder.add(name, "北大核心")
        elif t == "科技核心":
            cstpcd_builder.add(name, "科技核心")
        elif "社会" in t or "CSSCI" in t.upper():
            cssci_builder.add(name, "CSSCI")


def load_cas_json(
    path: Path,
    cas_up: DatasetBuilder,
    cas_top: DatasetBuilder,
    cas_warn: DatasetBuilder,
) -> None:
    """解析开源中科院分区表 JSON（cas_ranking.json，含大类分区/TOP/预警/ISSN 别名）。"""
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    journals = data.get("journals", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    for rec in journals:
        if not isinstance(rec, dict):
            continue
        title = clean_text(rec.get("title") or rec.get("name"))
        if not title:
            continue
        aliases: list[str] = []
        for a in (rec.get("aliases") or []):
            ac = clean_text(a)
            if ac:
                aliases.append(ac)
        for field in ("issn", "eissn"):
            vals = rec.get(field) or []
            if isinstance(vals, str):
                vals = [vals]
            for v in vals:
                aliases.extend(parse_issn_aliases(v))

        # 取大类最高分区（数字越小越优），并保留大类中文学科名（如：SCI升级版 材料科学3区）
        placements = [
            (int(p["zone"]), clean_text(p.get("category")))
            for p in (rec.get("majorPlacements") or [])
            if isinstance(p, dict) and str(p.get("zone", "")).isdigit()
        ]
        if placements:
            best_zone, best_cat = min(placements, key=lambda x: x[0])
            if 1 <= best_zone <= 4:
                cat_part = f"{best_cat}" if best_cat else ""
                cas_up.add(title, f"SCI升级版 {cat_part}{best_zone}区", aliases)
        if rec.get("isTop") is True:
            cas_top.add(title, "中科院TOP", aliases)
        if rec.get("isWarned") is True:
            cas_warn.add(title, "中科院预警", aliases)


def find_first_existing(base_dir: Path, names: list[str]) -> Path | None:
    for n in names:
        p = base_dir / n
        if p.exists() and p.is_file():
            return p
    return None


# ===================== 6. 主流程 =====================
def main() -> None:
    parser = argparse.ArgumentParser(description="构建 MyScholar 学术期刊分级 JSON 数据集")
    parser.add_argument("--dir", default=".", help="输入输出目录（默认当前目录）")
    parser.add_argument("--school-id", default="school_custom", help="高校目录数据集 ID（如 school_tsinghua）")
    parser.add_argument("--school-name", default="本校期刊分级目录", help="高校目录数据集显示名称")
    args = parser.parse_args()

    base_dir = Path(args.dir).resolve()
    version = dt.date.today().strftime("%Y-%m-%d")

    meta_all = dict(DATASET_META)
    school_id = args.school_id if args.school_id.startswith("school_") else f"school_{args.school_id}"
    meta_all[school_id] = {"name": args.school_name, "group": "custom", "color": "#7b1fa2"}

    builders: dict[str, DatasetBuilder] = {
        ds_id: DatasetBuilder(ds_id, meta) for ds_id, meta in meta_all.items()
    }

    skipped_files: list[str] = []
    loaded_files: list[tuple[str, str]] = []
    errors: list[str] = []

    def try_load(label_name: str, candidates: list[str], loader) -> None:
        p = find_first_existing(base_dir, candidates)
        if not p:
            skipped_files.append(f"{label_name} ({' / '.join(candidates)})")
            return
        try:
            loader(p)
            loaded_files.append((label_name, p.name))
        except Exception as e:
            errors.append(f"{p.name}: {e}")

    # 依次加载全部约定来源
    try_load("SCImago (SJR)", ["scimagojr.csv"], lambda p: load_scimago(p, builders["sjr"]))
    try_load("EI Compendex", ["compendex.xlsx", "compendex.csv"], lambda p: load_plain_list(p, builders["ei"], "EI", ["Source title", "Journal title", "Title", "刊名"]))
    try_load("MJL SCIE", ["mjl_scie.csv"], lambda p: load_plain_list(p, builders["jcr"], "SCIE", ["Journal title", "Title"]))
    try_load("MJL SSCI", ["mjl_ssci.csv"], lambda p: load_plain_list(p, builders["ssci"], "SSCI", ["Journal title", "Title"]))
    try_load("MJL A&HCI", ["mjl_ahci.csv"], lambda p: load_plain_list(p, builders["ahci"], "A&HCI", ["Journal title", "Title"]))
    try_load("MJL ESCI", ["mjl_esci.csv"], lambda p: load_plain_list(p, builders["esci"], "ESCI", ["Journal title", "Title"]))
    try_load("CCF 推荐目录", ["ccf.json", "ccf.xlsx", "ccf.csv"], lambda p: load_ccf(p, builders["ccf"]))
    try_load("CCF 中文高质量期刊", ["ccf_cn.json"], lambda p: load_ccf_cn(p, builders["ccf"]))
    try_load("中文核心开源合集", ["cn_core_raw.csv"], lambda p: load_cn_core_bundle(p, builders["pku"], builders["cstpcd"], builders["cssci"]))
    try_load("北大中文核心", ["pku.xlsx", "pku.csv", "pku.txt"], lambda p: load_plain_list(p, builders["pku"], "北大核心"))
    try_load("CSSCI 南大核心", ["cssci.xlsx", "cssci.csv", "cssci.txt"], lambda p: load_plain_list(p, builders["cssci"], "CSSCI"))
    try_load("CSCD 核心", ["cscd.xlsx", "cscd.csv", "cscd.txt"], lambda p: load_plain_list(p, builders["cscd"], "CSCD"))
    try_load("中国科技核心", ["cstpcd.xlsx", "cstpcd.csv", "cstpcd.txt"], lambda p: load_plain_list(p, builders["cstpcd"], "科技核心"))
    try_load("FT50", ["ft50.txt", "ft50.csv", "ft50.xlsx"], lambda p: load_plain_list(p, builders["ft50"], "FT50"))
    try_load("UTD24", ["utd24.txt", "utd24.csv", "utd24.xlsx"], lambda p: load_plain_list(p, builders["utd24"], "UTD24"))
    try_load("FMS", ["fms.txt", "fms.xlsx", "fms.csv"], lambda p: load_plain_list(p, builders["fms"], "FMS"))
    try_load("ABS / AJG", ["abs.xlsx", "abs.csv", "abs.txt"], lambda p: load_abs(p, builders["abs"]))
    try_load("高校分级目录", ["school.xlsx", "school.csv", "school.txt"], lambda p: load_plain_list(p, builders[school_id], args.school_name))
    try_load("JCR 影响因子与分区", ["jcr.csv", "jcr.xlsx"], lambda p: load_jcr(p, builders["jcr"], builders["sci_if"]))
    try_load("中科院分区表(JSON)", ["cas_ranking.json"], lambda p: load_cas_json(p, builders["cas_up"], builders["cas_top"], builders["cas_warn"]))
    try_load("中科院分区表(表格)", ["cas.xlsx", "cas.csv"], lambda p: load_cas(p, builders["cas_up"], builders["cas_top"]))
    try_load("中科院预警名单", ["cas_warning.txt", "cas_warning.csv", "cas_warning.xlsx"], lambda p: load_plain_list(p, builders["cas_warn"], "中科院预警"))

    # 汇总结果
    private_datasets: dict[str, dict[str, Any]] = {}
    public_datasets: dict[str, dict[str, Any]] = {}
    min_datasets: dict[str, dict[str, Any]] = {}

    for ds_id, builder in builders.items():
        items = builder.finalize_items()
        entry = {
            "name": builder.meta["name"],
            "group": builder.meta["group"],
            "color": builder.meta["color"],
            "items": items,
        }
        private_datasets[ds_id] = entry
        if ds_id not in PRIVATE_ONLY_IDS:
            public_datasets[ds_id] = entry
            if builder.meta["group"] in {"core", "custom"}:
                min_datasets[ds_id] = entry

    def write_compact_json(out_path: Path, ds_dict: dict[str, Any]) -> int:
        payload = {"version": version, "datasets": ds_dict}
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        out_path.write_text(raw, encoding="utf-8")
        return len(raw.encode("utf-8"))

    size_pub = write_compact_json(base_dir / "my_journals.json", public_datasets)
    size_priv = write_compact_json(base_dir / "my_journals.private.json", private_datasets)
    size_min = write_compact_json(base_dir / "my_journals.min.json", min_datasets)

    # 终端汇总输出
    print(f"=== MyScholar 数据构建完成 (version: {version}) ===")
    print(f"已加载来源 ({len(loaded_files)}): " + (", ".join(f"{n}[{f}]" for n, f in loaded_files) or "无"))
    print(f"跳过缺失来源 ({len(skipped_files)}): " + (", ".join(skipped_files) or "无"))
    if errors:
        print("解析错误:")
        for err in errors:
            print(f"  - {err}")

    print("\n各数据集统计:")
    total_items = 0
    for ds_id, b in builders.items():
        cnt = len(private_datasets[ds_id]["items"])
        total_items += cnt
        priv_tag = " [仅私有版]" if ds_id in PRIVATE_ONLY_IDS else ""
        print(
            f"  - {ds_id:<14} | 条数: {cnt:<6} | 别名: {b.alias_added:<5} "
            f"| 冲突: {b.conflicts:<4} | 异常行: {b.anomalies:<4} | 别名冲突跳过: {b.alias_skipped_conflict}{priv_tag}"
        )
    print(
        f"\n输出文件大小: my_journals.json={size_pub/1024:.1f}KB, "
        f"my_journals.private.json={size_priv/1024:.1f}KB, "
        f"my_journals.min.json={size_min/1024:.1f}KB (总条目 {total_items})"
    )

    # 生成 build_report.md
    lines: list[str] = [
        f"# MyScholar 期刊数据构建报告 ({version})",
        "",
        "## 1. 输出文件概览",
        f"- `my_journals.json`（公开版，不含 JCR/中科院分区）：**{size_pub/1024:.1f} KB**，共 {sum(len(v['items']) for v in public_datasets.values())} 条",
        f"- `my_journals.private.json`（私有版，含全部数据集）：**{size_priv/1024:.1f} KB**，共 {total_items} 条",
        f"- `my_journals.min.json`（精简公开版，仅 core + custom 分组）：**{size_min/1024:.1f} KB**，共 {sum(len(v['items']) for v in min_datasets.values())} 条",
        "",
        "## 2. 各数据集统计",
        "| ID | 名称 | 分组 | 条数(含别名) | 别名数 | 冲突数 | 异常行数 | 仅私有版 |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | :---: |",
    ]
    for ds_id, b in builders.items():
        cnt = len(private_datasets[ds_id]["items"])
        priv = "是" if ds_id in PRIVATE_ONLY_IDS else "否"
        lines.append(
            f"| `{ds_id}` | {b.meta['name']} | {b.meta['group']} | {cnt} | {b.alias_added} | {b.conflicts} | {b.anomalies} | {priv} |"
        )

    lines.extend(["", "## 3. 已加载与跳过的文件", "### 已加载"])
    if loaded_files:
        for name, fname in loaded_files:
            lines.append(f"- {name}: `{fname}`")
    else:
        lines.append("- 无")

    lines.append("\n### 跳过（未在工作目录找到）")
    if skipped_files:
        for sf in skipped_files:
            lines.append(f"- {sf}")
    else:
        lines.append("- 无")

    if errors:
        lines.append("\n### 解析异常")
        for err in errors:
            lines.append(f"- {err}")

    lines.extend(["", "## 4. 数据抽样（每个非空数据集前 5 条）"])
    for ds_id, entry in private_datasets.items():
        items = entry["items"]
        if not items:
            continue
        lines.append(f"\n### `{ds_id}` - {entry['name']}（共 {len(items)} 条）")
        lines.append("| 刊名 / 别名 | 标签 |")
        lines.append("| --- | --- |")
        for k, v in list(items.items())[:5]:
            safe_k = k.replace("|", "\\|")
            safe_v = v.replace("|", "\\|")
            lines.append(f"| {safe_k} | `{safe_v}` |")

    (base_dir / "build_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
