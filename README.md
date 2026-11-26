# MyScholar 学术分级数据构建与远程同步方案

本项目用于将多来源学术期刊/会议分级名单清洗、去重并构建为统一 JSON，并配合油猴脚本 `myscholar.user.js`（v2.2.0）在多台电脑间通过 GitHub 自动定时同步。

---

## 1. 目录结构说明

```text
e:\Scholar\
├── build_journals.py         # 数据清洗、去重、别名补全与 JSON 构建脚本
├── myscholar.user.js         # 油猴脚本 v2.2.0（支持远程定时同步与分库存储）
├── requirements.txt          # Python 依赖（pandas, openpyxl）
├── README.md                 # 使用与年度更新文档
├── build_report.md           # 每次构建自动生成的统计与抽样报告
│
├── my_journals.json          # 【公开版】不含 JCR 影响因子/分区与中科院分区（可放公开仓库）
├── my_journals.min.json      # 【精简公开版】仅包含 core 与 custom 分组（体积敏感场景）
├── my_journals.private.json  # 【私有版】含全部数据集（含 JCR/中科院分区，仅放私有仓库）
│
└── （原始输入文件，按需放入本目录，缺失文件自动跳过）
    ├── scimagojr.csv         # SCImago SJR 导出表
    ├── compendex.xlsx        # Elsevier Compendex (EI) Source List
    ├── mjl_scie.csv / mjl_ssci.csv / mjl_ahci.csv / mjl_esci.csv
    ├── ccf.json / ccf.xlsx   # CCF 推荐目录（已预下载 2026 第7版 ccf.json）
    ├── pku.xlsx / cssci.xlsx / cscd.xlsx / cstpcd.xlsx
    ├── ft50.txt / utd24.txt / fms.txt / abs.xlsx
    ├── school.xlsx           # 本校期刊分级目录
    ├── jcr.csv               # Clarivate JCR 导出（有版权，仅进私有版）
    ├── cas.xlsx              # 中科院分区表（有版权，仅进私有版）
    └── cas_warning.txt       # 中科院国际期刊预警名单（已预置 2025 版）
```

---

## 2. 各来源官网获取方式与所需列

> 原则：仅从官方或公开渠道获取原始表，不爬取任何商业插件服务器，不编造期刊等级。`build_journals.py` 会自动匹配常见中英文列名、分隔符与编码。

| 文件名 | 数据集 ID | 官方获取渠道 | 必需列 / 格式 | 可选辅助列（用于别名） |
| --- | --- | --- | --- | --- |
| `scimagojr.csv` | `sjr` | SCImago Journal & Country Rank (`scimagojr.com`，点页面 Download data；带 Cloudflare 防护需浏览器手动下载) | `Title`、`SJR Best Quartile`（分号分隔） | `Issn` |
| `compendex.xlsx` | `ei` | Elsevier Engineering Village Compendex Source List | `Source title` / `Journal title` / `Title` | `ISSN` |
| `mjl_scie.csv` | `jcr` (仅私有版) | Clarivate Master Journal List (`mjl.clarivate.com`，免费注册后下载) | `Journal title` | `ISSN`、`eISSN` |
| `mjl_ssci.csv` | `ssci` | Clarivate Master Journal List | `Journal title` | `ISSN`、`eISSN` |
| `mjl_ahci.csv` | `ahci` | Clarivate Master Journal List | `Journal title` | `ISSN`、`eISSN` |
| `mjl_esci.csv` | `esci` | Clarivate Master Journal List | `Journal title` | `ISSN`、`eISSN` |
| `ccf.json` / `ccf.xlsx` | `ccf` | 中国计算机学会官网 (`ccf.org.cn`) 或开源 CCF 目录 JSON | `name`（刊物全称）、`rank`（A/B/C） | `abbr`（简称）、`issn` |
| `pku.xlsx` | `pku` | 北京大学图书馆《中文核心期刊要目总览》 | `期刊名` / `刊名` | `ISSN` |
| `cssci.xlsx` | `cssci` | 南京大学中国社会科学研究评价中心 (CSSCI) | `期刊名` / `刊名` | `ISSN` |
| `cscd.xlsx` | `cscd` | 中国科学院文献情报中心 (CSCD) | `期刊名` / `刊名` | `ISSN` |
| `cstpcd.xlsx` | `cstpcd` | 中国科学技术信息研究所《中国科技核心期刊目录》 | `期刊名` / `刊名` | `ISSN` |
| `ft50.txt` | `ft50` | Financial Times (`ft.com`) FT50 列表 | 一行一个刊名 | — |
| `utd24.txt` | `utd24` | UT Dallas JSOM (`jindal.utdallas.edu`) | 一行一个刊名 | — |
| `fms.txt` / `fms.xlsx` | `fms` | FMS 管理科学高质量期刊推荐列表 | 单列刊名，或 `刊名 + 等级`（如 `FMS-T1`） | `ISSN` |
| `abs.xlsx` | `abs` | Chartered ABS Academic Journal Guide (AJG) | `Title`、`Rank`（如 `ABS 4*`） | `ISSN` |
| `school.xlsx` | `school_<校名拼音>` | 本校科研处 / 研究生院文件 | `期刊名`、`等级`（可选） | `ISSN` |
| `jcr.csv` | `jcr` + `sci_if`（仅私有版） | Clarivate Journal Citation Reports（需高校订阅权限导出） | `Journal name`、`JIF Quartile`、`JIF` | `JCR Abbreviation`、`ISSN`、`eISSN` |
| `cas.xlsx` | `cas_up` + `cas_top`（仅私有版） | 中科院文献情报中心期刊分区表（需高校订阅） | `Journal`、`大类分区`、`Top` | `ISSN` |
| `cas_warning.txt` | `cas_warn` | 中科院文献情报中心《国际期刊预警名单》(`earlywarning.fenqubiao.com`) | 一行一个刊名 | — |

---

## 3. 一键拉取与每年更新流程

### 方式 A：一键脚本（最省事，推荐）
1. **安装 Python 依赖（首次运行）**
   ```powershell
   pip install -r requirements.txt
   ```
2. **双击 `update_all.bat`**（或在终端运行 `python fetch_data.py`）：
   - 自动从公开开源渠道下载 **CCF 2026 国际目录、CCF 2025 中文目录、ABS/AJG、国内中文核心/科技核心合集、中科院 2025 分区表（仅进私有版）**；
   - 自动调用 `build_journals.py` 清洗合并并生成三份 JSON 与 `build_report.md`。

### 方式 B：手动补充表格后再构建
1. 如需补充 SCImago（2.9 万+ 期刊）或本校目录 `school.xlsx`，直接放进工作目录。
2. **运行构建脚本**
   ```powershell
   python build_journals.py
   # 若包含高校目录 school.xlsx，可指定本校拼音 ID 与名称：
   python build_journals.py --school-id school_tsinghua --school-name 清华大学目录
   ```
3. **核对 `build_report.md`**，确认各库条数、冲突数和抽样结果无异常。
4. **推送到 GitHub**
   ```powershell
   git add my_journals.json my_journals.min.json build_report.md
   git commit -m "chore: update journal rankings $(Get-Date -Format yyyy-MM-dd)"
   git push
   ```
   > 若使用私有仓库同步完整版，则在私有仓库中提交 `my_journals.private.json`。

---

## 4. GitHub 仓库与细粒度只读 PAT 配置

### 4.1 公开仓库 vs 私有仓库放什么
- **公开仓库（Public Repo）**：只放 `my_journals.json`、`my_journals.min.json`、`build_journals.py`、`myscholar.user.js`、`README.md`、`build_report.md`。**切勿**将 `jcr.csv`、`cas.xlsx`、`my_journals.private.json` 提交到公开仓库（建议在公开仓库 `.gitignore` 中排除它们）。
- **私有仓库（Private Repo）**：可放置 `my_journals.private.json`（含个人通过高校订阅导出的 JCR 影响因子/分区与中科院分区），仅供个人多设备同步使用。

### 4.2 创建只读 Fine-grained PAT（仅私有仓库需要）
1. 登录 GitHub → 右上角头像 → **Settings** → 左侧底部 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**。
2. **Token name**：如 `myscholar-readonly`；设置合适的过期时间（如 1 年）。
3. **Repository access**：选择 **Only select repositories**，只勾选你的私有数据仓库。
4. **Permissions → Repository permissions**：找到 **Contents**，设为 **Read-only**；其余全部保持 **No access**。
5. 点击生成并复制 `github_pat_...` Token（仅显示一次）。

### 4.3 `raw.githubusercontent.com` URL 写法
```text
https://raw.githubusercontent.com/<你的GitHub用户名>/<仓库名>/<分支名>/<文件名>
```
示例：
- 公开版：`https://raw.githubusercontent.com/yourname/myscholar-data/main/my_journals.json`
- 精简版：`https://raw.githubusercontent.com/yourname/myscholar-data/main/my_journals.min.json`
- 私有版：`https://raw.githubusercontent.com/yourname/myscholar-private/main/my_journals.private.json`

---

## 5. 多台电脑的首次配置步骤

1. 在浏览器安装 **Tampermonkey（篡改猴）** 或 **ScriptCat（脚本猫）** 扩展。
2. 新建脚本，将本目录完整的 `myscholar.user.js`（v2.2.0）粘贴保存。
3. 打开任意支持的学术网站（如 Google Scholar、知网、PubMed、WoS、IEEE、ScienceDirect）。
4. 点击右下角 `📚` 悬浮球（或油猴菜单）→ 点击 **🔗 设置同步地址**：
   - 填入上文的 `raw.githubusercontent.com` URL；
   - 公开仓库 Token 留空，私有仓库填入 `github_pat_...`；
   - 同步间隔默认 `168`（7 天）即可。
5. 保存后脚本会自动触发一次同步，之后每隔 168 小时在打开学术页面时自动检查更新；你随时可以点击 **🔄 立即同步** 手动刷新。
6. 你在任意电脑上手动新建的自定义数据集（不带 `☁️` 远程标记）不会在同步时被覆盖或删除。

---

## 6. 性能评估与优化说明（3 万+ 条目场景）

针对全量导入 SJR + EI + MJL + 国内核心后数据量达到 **35,000+ 条** 的场景，我们对存储体积与索引耗时进行了基准实测（Node v24，模拟 35,000 条 / 6 个数据集）：

| 指标 | 优化前（v2.1 单 key + 启动全量重建） | 优化后（v2.2 分库存储 + 惰性/增量索引） |
| --- | --- | --- |
| 35,000 条 JSON 总体积 | ~2.31 MB（单 key 每次全量写入） | 按库拆分：`ms2_ds_meta_v2` (<2 KB) + `ms2_ds_items_v2_<id>` |
| 编辑单库（1,500 条）序列化耗时 | 9.04 ms（全量 `JSON.stringify`） | **0.32 ms**（仅写变更库，提速约 28 倍） |
| 索引构建耗时 | 60.94 ms（每次启动/编辑全量重建） | **2.33 ms**（单库增量重建；未启用库 0 ms） |
| 1,000 次跨库查询耗时 | 1.83 ms（单次 0.0018 ms） | 1.83 ms（`Map.get` O(1) 查询） |

**采取的具体优化措施：**
1. **按数据集分 key 存储**：将元信息存入 `ms2_ds_meta_v2`，各库 `items` 独立存入 `ms2_ds_items_v2_<id>`（首次升级自动从 v2.1 的 `ms2_datasets_v1` 迁移）。修改自定义库或同步部分库时不再重写数 MB 的大对象。
2. **惰性 + 增量索引重建**：脚本启动时不再一次性对所有未启用的大数据集跑 `normalize()`；仅在数据集启用且首次查询时构建其 `Map`，远程同步或本地导入后也只失效并重建发生变更的库。
3. **精简版输出**：提供 `my_journals.min.json`（仅 `core` + `custom` 分组），方便低配设备或仅需核心目录的场景使用。

---

## 7. 常见问题排查

### Q1：某些期刊在页面上匹配不到标签怎么办？
1. 打开控制面板，开启 **🐛 调试模式（显示识别到的刊名）**，刷新页面。
2. 未命中的条目下方会出现灰色虚线标签 `🔍 识别为: xxx (未收录)`，确认页面实际提取出的刊名文本（例如 Google Scholar 可能会截断刊名末尾，或使用缩写）。
3. 解决方式：
   - **临时补录**：在控制面板点击 **📥 批量导入/粘贴数据**，将识别到的缩写或截断名补入对应库（增量合并）。
   - **长期维护**：在源表格的简称/别名列补充该别名，重跑 `python build_journals.py` 并推送到 GitHub。

### Q2：推送到 GitHub 后，浏览器里数据没有立即更新？
1. **自动同步周期未到**：默认每 `168` 小时检查一次，请在面板或油猴菜单点击 **🔄 立即同步** 强制拉取。
2. **GitHub Raw CDN 缓存**：`raw.githubusercontent.com` 存在约 5 分钟的边缘缓存，刚 `git push` 后可稍等 3~5 分钟再点立即同步。
3. **版本号未变化**：`build_journals.py` 默认使用当天日期 `YYYY-MM-DD` 作为 `version`。同一天内二次推送后，自动定时同步会因 `version` 相同跳过写入，点击 **🔄 立即同步**（`force=true`）即可强制覆盖。

### Q3：同步失败会影响页面正常浏览吗？
不会。无论断网、超时、404 还是 Token 失效，`syncRemote()` 仅在浏览器开发者工具 Console 输出 `[MyScholar]` 警告并在面板状态栏提示，不会弹窗，也不会影响已有本地数据的渲染和 OpenAlex 兜底。
