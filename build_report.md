# MyScholar 期刊数据构建报告 (2026-11-26)

## 1. 输出文件概览
- `my_journals.json`（公开版，不含 JCR/中科院分区）：**2659.0 KB**，共 90897 条
- `my_journals.private.json`（私有版，含全部数据集）：**4919.2 KB**，共 156175 条
- `my_journals.min.json`（精简公开版，仅 core + custom 分组）：**172.7 KB**，共 4518 条

## 2. 各数据集统计
| ID | 名称 | 分组 | 条数(含别名) | 别名数 | 冲突数 | 异常行数 | 仅私有版 |
| --- | --- | --- | ---: | ---: | ---: | ---: | :---: |
| `cas_up` | SCI (中科院升级版) | core | 60222 | 38451 | 0 | 0 | 是 |
| `cas_top` | SCI中科院TOP期刊 | core | 5056 | 3267 | 0 | 0 | 是 |
| `cas_warn` | SCI (中科院预警) | core | 14 | 9 | 0 | 0 | 否 |
| `sci_if` | SCI影响因子 | core | 0 | 0 | 0 | 0 | 是 |
| `jcr` | SCI (Clarivate-JCR) | core | 0 | 0 | 0 | 0 | 是 |
| `ei` | EI | core | 0 | 0 | 0 | 0 | 否 |
| `ccf` | 中国计算机学会(CCF) | core | 1450 | 705 | 1 | 0 | 否 |
| `pku` | 北大中文核心 | core | 1964 | 0 | 0 | 0 | 否 |
| `cssci` | CSSCI南大核心 | core | 102 | 0 | 0 | 0 | 否 |
| `cscd` | 中国科学引文(CSCD) | core | 0 | 0 | 0 | 0 | 否 |
| `cstpcd` | 中国科技核心 | core | 988 | 0 | 0 | 0 | 否 |
| `ssci` | SSCI (Clarivate) | more | 0 | 0 | 0 | 0 | 否 |
| `ahci` | A&HCI检索 | more | 0 | 0 | 0 | 0 | 否 |
| `esci` | ESCI (Clarivate) | more | 0 | 0 | 0 | 0 | 否 |
| `ft50` | FT50 | more | 49 | 0 | 0 | 0 | 否 |
| `utd24` | UTD24 | more | 24 | 0 | 0 | 0 | 否 |
| `fms` | FMS | more | 0 | 0 | 0 | 0 | 否 |
| `abs` | AJG (原ABS) | more | 3395 | 1697 | 0 | 0 | 否 |
| `sjr` | SCImago (SJR) | more | 82911 | 51835 | 10 | 0 | 否 |
| `school_custom` | 本校期刊分级目录 | custom | 0 | 0 | 0 | 0 | 否 |

## 3. 已加载与跳过的文件
### 已加载
- SCImago (SJR): `scimagojr.csv`
- CCF 推荐目录: `ccf.json`
- CCF 中文高质量期刊: `ccf_cn.json`
- 中文核心开源合集: `cn_core_raw.csv`
- FT50: `ft50.txt`
- UTD24: `utd24.txt`
- ABS / AJG: `abs.xlsx`
- 中科院分区表(JSON): `cas_ranking.json`
- 中科院预警名单: `cas_warning.txt`

### 跳过（未在工作目录找到）
- EI Compendex (compendex.xlsx / compendex.csv)
- MJL SCIE (mjl_scie.csv)
- MJL SSCI (mjl_ssci.csv)
- MJL A&HCI (mjl_ahci.csv)
- MJL ESCI (mjl_esci.csv)
- 北大中文核心 (pku.xlsx / pku.csv / pku.txt)
- CSSCI 南大核心 (cssci.xlsx / cssci.csv / cssci.txt)
- CSCD 核心 (cscd.xlsx / cscd.csv / cscd.txt)
- 中国科技核心 (cstpcd.xlsx / cstpcd.csv / cstpcd.txt)
- FMS (fms.txt / fms.xlsx / fms.csv)
- 高校分级目录 (school.xlsx / school.csv / school.txt)
- JCR 影响因子与分区 (jcr.csv / jcr.xlsx)
- 中科院分区表(表格) (cas.xlsx / cas.csv)

## 4. 数据抽样（每个非空数据集前 5 条）

### `cas_up` - SCI (中科院升级版)（共 60222 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| 20 Et 21-Revue D Histoire | `中科院4区` |
| 2D Materials | `中科院3区` |
| 3 Biotech | `中科院4区` |
| 3C Empresa | `中科院4区` |
| 3c Tecnologia | `中科院4区` |

### `cas_top` - SCI中科院TOP期刊（共 5056 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| ACADEMIC MEDICINE | `TOP` |
| Academy of Management Annals | `TOP` |
| ACADEMY OF MANAGEMENT JOURNAL | `TOP` |
| ACADEMY OF MANAGEMENT REVIEW | `TOP` |
| ACCIDENT ANALYSIS AND PREVENTION | `TOP` |

### `cas_warn` - SCI (中科院预警)（共 14 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| COMPUTERS & ELECTRICAL ENGINEERING | `预警` |
| NATURAL RESOURCES FORUM | `预警` |
| NUMERICAL HEAT TRANSFER PART A-APPLICATIONS | `预警` |
| Scalable Computing-Practice and Experience | `预警` |
| WIRELESS PERSONAL COMMUNICATIONS | `预警` |

### `ccf` - 中国计算机学会(CCF)（共 1450 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| ACM Transactions on Computer Systems | `CCF-A` |
| ACM Transactions on Storage | `CCF-A` |
| IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems | `CCF-A` |
| IEEE Transactions on Computers | `CCF-A` |
| IEEE Transactions on Parallel and Distributed Systems | `CCF-A` |

### `pku` - 北大中文核心（共 1964 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| 阿拉伯世界研究 | `北大核心` |
| 安徽大学学报(哲学社会科学版) | `北大核心` |
| 安徽大学学报(自然科学版) | `北大核心` |
| 安徽农业大学学报 | `北大核心` |
| 安徽师范大学学报(人文社会科学版) | `北大核心` |

### `cssci` - CSSCI南大核心（共 102 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| 安徽大学学报哲学社会科学版 | `CSSCI` |
| 安徽师范大学学报人文社会科学版 | `CSSCI` |
| 北京大学学报哲学社会科学版 | `CSSCI` |
| 北京工商大学学报社会科学版 | `CSSCI` |
| 北京师范大学学报社会科学版 | `CSSCI` |

### `cstpcd` - 中国科技核心（共 988 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| acta mathematica sinica english series | `科技核心` |
| acta mathematicae applicatae sinica | `科技核心` |
| acta pharmaceutica sinica b | `科技核心` |
| advances in polar science | `科技核心` |
| cancer biology & medicine | `科技核心` |

### `ft50` - FT50（共 49 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| Academy of Management Annals | `FT50` |
| Academy of Management Journal | `FT50` |
| Academy of Management Review | `FT50` |
| Accounting, Organizations and Society | `FT50` |
| Administrative Science Quarterly | `FT50` |

### `utd24` - UTD24（共 24 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| The Accounting Review | `UTD24` |
| Journal of Accounting and Economics | `UTD24` |
| Journal of Accounting Research | `UTD24` |
| Journal of Finance | `UTD24` |
| Journal of Financial Economics | `UTD24` |

### `abs` - AJG (原ABS)（共 3395 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| Academy of Management Annals | `ABS 4*` |
| Academy of Management Journal | `ABS 4*` |
| Academy of Management Learning and Education | `ABS 4*` |
| Academy of Management Review | `ABS 4*` |
| Accounting Review | `ABS 4*` |

### `sjr` - SCImago (SJR)（共 82911 条）
| 刊名 / 别名 | 标签 |
| --- | --- |
| Ca-A Cancer Journal for Clinicians | `SJR Q1` |
| Nature Reviews Molecular Cell Biology | `SJR Q1` |
| Quarterly Journal of Economics | `SJR Q1` |
| Nature Reviews Drug Discovery | `SJR Q1` |
| Nature Reviews Clinical Oncology | `SJR Q1` |
