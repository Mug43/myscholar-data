#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MyScholar 一键拉取公开开源期刊目录并自动构建 JSON
用法：
  python fetch_data.py              # 下载全部公开源并自动运行 build_journals.py
  python fetch_data.py --no-build   # 仅下载原始文件，不构建
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import urllib.request
from pathlib import Path

# 全部来自公开 GitHub 开源仓库，无商业插件爬虫
PUBLIC_SOURCES: list[tuple[str, str, str]] = [
    (
        "ccf.json",
        "CCF 2026 第7版国际期刊/会议目录",
        "https://gist.githubusercontent.com/ayusdixit/3dac1dcc26ece8a2ddbe3da019d671ea/raw",
    ),
    (
        "ccf_cn.json",
        "CCF 2025 中文高质量科技期刊分级目录",
        "https://raw.githubusercontent.com/nyaru177/ccf-for-zotero/main/src/data/ccf-high-quality-journals-2025.json",
    ),
    (
        "abs.xlsx",
        "ABS / AJG 商科期刊分级目录",
        "https://raw.githubusercontent.com/mevalerio/AJG-CABS/main/AJG2021.xlsx",
    ),
    (
        "cn_core_raw.csv",
        "国内中文核心/科技核心开源合集",
        "https://raw.githubusercontent.com/beneon/cssci/master/journalscore.csv",
    ),
    (
        "cas_ranking.json",
        "中科院期刊分区表 2025（仅写入私有版 my_journals.private.json）",
        "https://raw.githubusercontent.com/nyaru177/ccf-for-zotero/main/src/data/cas-journal-ranking.json",
    ),
]


def download_file(url: str, dest: Path, timeout: int = 30) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "MyScholar-Updater/2.2"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        if not data:
            print(f"  [跳过] 空响应: {dest.name}")
            return False
        dest.write_bytes(data)
        print(f"  [成功] {dest.name} ({len(data)/1024:.1f} KB)")
        return True
    except Exception as e:
        print(f"  [失败] {dest.name}: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="一键下载公开开源期刊目录并构建 MyScholar JSON")
    parser.add_argument("--no-build", action="store_true", help="只下载文件，不自动执行 build_journals.py")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    print("=== 第 1 步：下载公开开源期刊数据 ===")
    ok_cnt = 0
    for fname, desc, url in PUBLIC_SOURCES:
        print(f"-> 正在下载 {desc} ...")
        if download_file(url, base_dir / fname):
            ok_cnt += 1

    print(f"\n下载完成：{ok_cnt}/{len(PUBLIC_SOURCES)} 个来源成功。")
    print("提示：如需补充 SCImago (2.9万+期刊)，请用浏览器下载 https://www.scimagojr.com/journalrank.php?out=xls 并保存为 scimagojr.csv。\n")

    if not args.no_build:
        print("=== 第 2 步：运行 build_journals.py 生成 JSON ===")
        subprocess.run([sys.executable, str(base_dir / "build_journals.py"), "--dir", str(base_dir)], check=True)


if __name__ == "__main__":
    main()
