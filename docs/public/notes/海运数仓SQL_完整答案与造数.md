# 海运数仓 SQL · 完整答案与造数

> 配套《海运数仓 SQL 图解学习手册》。本文件提供：5 张核心表 DDL、可运行造数脚本、Q1~Q5 完整参考答案。
> 引擎约定：MySQL 8 / Hive / Spark SQL 均可，差异处已标注。

---

## 一、表结构（DDL）

### 表1 柜清单快照 `dwd_sea_container_full`

主表。每个柜一条快照记录，按 `dt` 分区（每日全量）。

```sql
CREATE TABLE dwd_sea_container_full (
    container_no   VARCHAR(50)  COMMENT '柜号',
    cust_id        VARCHAR(50)  COMMENT '客户ID',
    dest_port      VARCHAR(50)  COMMENT '目的港',
    book_weight    DECIMAL(12,2) COMMENT '订舱重量',
    book_volume    DECIMAL(12,2) COMMENT '订舱体积',
    container_status VARCHAR(20) COMMENT '柜状态',
    dt             VARCHAR(10)  COMMENT '快照日期 yyyy-MM-dd',
    del_flag       INT          COMMENT '删除标记 0正常/1删除'
);
```

### 表2 入库明细 `dwd_sea_goods_inbound_full`

事实表。每条入库操作一条记录（一个柜可能多条）。

```sql
CREATE TABLE dwd_sea_goods_inbound_full (
    cargo_no      VARCHAR(50)   COMMENT '票号(货物单号)',
    container_no  VARCHAR(50)   COMMENT '柜号',
    inbound_time  DATETIME      COMMENT '入库时间',
    actual_weight DECIMAL(12,2) COMMENT '实际重量',
    actual_volume DECIMAL(12,2) COMMENT '实际体积',
    inbound_type  VARCHAR(20)   COMMENT '入库类型：正常/退仓',
    data_status   VARCHAR(20)   COMMENT '数据状态：有效/无效',
    del_flag      INT           COMMENT '删除标记'
);
```

### 表3 换柜流水 `dwd_sea_container_change`

缓慢变化维的流水。记录换柜事件 old→new。

```sql
CREATE TABLE dwd_sea_container_change (
    cargo_no       VARCHAR(50)  COMMENT '票号',
    old_container_no VARCHAR(50) COMMENT '旧柜号',
    new_container_no VARCHAR(50) COMMENT '新柜号',
    change_time    DATETIME     COMMENT '换柜时间'
);
```

### 表4 订舱快照 `dwd_sea_booking_full`

每日快照。提供"当时存在什么"，`container_status` 按日变化。

```sql
CREATE TABLE dwd_sea_booking_full (
    booking_id      VARCHAR(50) COMMENT '订舱ID',
    container_no    VARCHAR(50) COMMENT '柜号',
    cust_id         VARCHAR(50) COMMENT '客户ID',
    container_status VARCHAR(20) COMMENT '柜状态：已配柜/已出运/已签收',
    plan_sail_date  DATE        COMMENT '计划开船日',
    create_time     DATETIME    COMMENT '创建时间',
    dt              VARCHAR(10) COMMENT '快照日期',
    del_flag        INT         COMMENT '删除标记'
);
```

### 表5 客户主表 `dim_cust`

客户维度表。

```sql
CREATE TABLE dim_cust (
    cust_id    VARCHAR(50) PRIMARY KEY COMMENT '客户ID',
    cust_name  VARCHAR(100) COMMENT '客户名称'
);
```

---

## 二、造数脚本

> 造数刻意保留"脏数据"：换柜残留、退仓、空柜、快照回刷——正是 5 道题要处理的坑。

```sql
-- ============ 客户 ============
INSERT INTO dim_cust VALUES
('C001','甲客户'), ('C002','乙客户'), ('C003','丙客户');

-- ============ 柜清单快照（dt=2026-07-31）============
INSERT INTO dwd_sea_container_full VALUES
('CTN001','C001','上海港', 20.0, 30.0, '已配柜','2026-07-31',0),
('CTN002','C001','上海港', 20.0, 30.0, '已配柜','2026-07-31',0),
('CTN003','C002','宁波港', 15.0, 20.0, '已配柜','2026-07-31',0),
('CTN004','C002','宁波港', 15.0, 20.0, '已配柜','2026-07-31',0),
('CTN005','C003','深圳港', 10.0, 15.0, '已配柜','2026-07-31',0),  -- 空柜：无任何入库
('CTN006','C003','深圳港', 10.0, 15.0, '已配柜','2026-07-31',1);  -- 已删除，应被过滤

-- ============ 入库明细（7月）============
INSERT INTO dwd_sea_goods_inbound_full VALUES
-- 正常入库
('BL001','CTN001','2026-07-05 10:00:00', 8.0, 12.0,'正常','有效',0),
('BL002','CTN001','2026-07-06 11:00:00', 5.0,  8.0,'正常','有效',0),
('BL003','CTN002','2026-07-08 09:00:00', 12.0, 18.0,'正常','有效',0),
-- 换柜残留：票 BL004 从 CTN003 换到 CTN004，旧记录还在 CTN003 上
('BL004','CTN003','2026-07-10 14:00:00', 9.0, 14.0,'正常','有效',0),
-- 退仓记录（Q1 要剔、Q2 要保留）
('BL005','CTN004','2026-07-12 16:00:00', 9.0, 14.0,'退仓','有效',0),
('BL006','CTN004','2026-07-12 17:00:00',-9.0,-14.0,'退仓','有效',0),
-- 无效数据（应被过滤）
('BL007','CTN004','2026-07-15 10:00:00', 3.0,  5.0,'正常','无效',0);

-- ============ 换柜流水 ============
INSERT INTO dwd_sea_container_change VALUES
('BL004','CTN003','CTN004','2026-07-11 08:00:00');

-- ============ 订舱快照（7月每日，此处示例造 7-01 与 7-31 两日）============
INSERT INTO dwd_sea_booking_full VALUES
('BK001','CTN001','C001','已出运','2026-07-10','2026-07-01 09:00:00','2026-07-01',0),
('BK002','CTN002','C001','已配柜','2026-07-12','2026-07-01 09:00:00','2026-07-01',0),
('BK003','CTN003','C002','已出运','2026-07-10','2026-07-01 09:00:00','2026-07-01',0),
('BK004','CTN004','C002','已配柜','2026-07-15','2026-07-01 09:00:00','2026-07-01',0),
-- 7-31 最终快照：CTN002 在 7-15 被物理删除（31 日快照 del_flag=1）
('BK001','CTN001','C001','已签收','2026-07-10','2026-07-01 09:00:00','2026-07-31',0),
('BK002','CTN002','C001','已配柜','2026-07-12','2026-07-01 09:00:00','2026-07-31',1),
('BK003','CTN003','C002','已签收','2026-07-10','2026-07-01 09:00:00','2026-07-31',0),
('BK004','CTN004','C002','已出运','2026-07-15','2026-07-01 09:00:00','2026-07-31',0);
```

---

## 三、Q1~Q5 完整参考答案

### Q1 换柜数据精准统计（★★☆☆☆）

**口径**：7月入库 / 有效 / 剔退仓 / 最新柜号归属 / 补0

```sql
-- CTE1 换柜映射：每票货取最新柜号
WITH container_map AS (
    SELECT cargo_no, new_container_no AS latest_no,
           ROW_NUMBER() OVER (PARTITION BY cargo_no ORDER BY change_time DESC) AS rn
    FROM dwd_sea_container_change
),
-- CTE2 有效入库：过滤四件套 + 剔退仓
valid_inbound AS (
    SELECT *
    FROM dwd_sea_goods_inbound_full
    WHERE data_status = '有效'
      AND del_flag = 0
      AND inbound_type <> '退仓'
      AND inbound_time >= '2026-07-01'
      AND inbound_time <  '2026-08-01'
),
-- CTE3 换柜迁移：旧柜号换成最新柜号
migrated AS (
    SELECT COALESCE(m.latest_no, i.container_no) AS final_container,
           i.cargo_no, i.actual_weight, i.actual_volume
    FROM valid_inbound i
    LEFT JOIN container_map m
      ON i.cargo_no = m.cargo_no AND m.rn = 1
)
-- 最终：主表 = 柜清单，LEFT JOIN + 补0
SELECT b.container_no,
       COALESCE(SUM(g.actual_weight), 0) AS final_total_weight,
       COALESCE(SUM(g.actual_volume), 0) AS final_total_volume,
       COUNT(DISTINCT g.cargo_no)        AS cargo_ticket_cnt
FROM dwd_sea_container_full b
LEFT JOIN migrated g ON b.container_no = g.final_container
WHERE b.dt = '2026-07-31' AND b.del_flag = 0
GROUP BY b.container_no;
```

**考点**：ROW_NUMBER 取最新、LEFT JOIN 补 0、主表选择、换柜口径。

---

### Q2 海运进仓异常数据统计（★★★☆☆）

**口径**：7月计划开船 / 有效 / 退仓**保留**（与 Q1 相反）

```sql
-- CTE1 7月有效柜全集
WITH valid_container AS (
    SELECT container_no, cust_id, book_weight, book_volume, old_plan_sail_date
    FROM dwd_sea_container_full
    WHERE del_flag = 0
      AND dt = '2026-07-31'
      AND plan_sail_month = '2026-07'   -- 计划开船在7月（实际字段按需替换）
),
-- CTE2 有效入库（含退仓！）
valid_inbound AS (
    SELECT *
    FROM dwd_sea_goods_inbound_full
    WHERE data_status = '有效' AND del_flag = 0
      AND inbound_time >= '2026-07-01' AND inbound_time < '2026-08-01'
),
-- CTE3 柜级聚合
container_stat AS (
    SELECT container_no,
           SUM(actual_weight) AS total_w,
           COUNT(1)           AS inbound_cnt,
           MIN(inbound_time)  AS first_time
    FROM valid_inbound
    GROUP BY container_no
)
-- ④ 柜级打标 → 客户级汇总
SELECT v.cust_id,
       COUNT(1) AS total_container_cnt,
       COUNT(IF(c.total_w > v.book_weight, 1, NULL))  AS over_weight_cnt,
       COUNT(IF(c.total_w = 0, 1, NULL))              AS full_refund_cnt,
       COUNT(IF(c.inbound_cnt IS NULL, 1, NULL))      AS empty_cnt,
       COUNT(IF(c.first_time > CONCAT(v.old_plan_sail_date, ' 23:59:59'), 1, NULL)) AS delay_inbound_cnt,
       ROUND((COUNT(IF(c.total_w > v.book_weight,1,NULL))
            + COUNT(IF(c.total_w = 0,1,NULL))
            + COUNT(IF(c.inbound_cnt IS NULL,1,NULL))
            + COUNT(IF(c.first_time > CONCAT(v.old_plan_sail_date,' 23:59:59'),1,NULL)))
            / COUNT(1), 2) AS abnormal_ratio
FROM valid_container v
LEFT JOIN container_stat c ON v.container_no = c.container_no
GROUP BY v.cust_id;
```

**考点**：COUNT(IF) 条件聚合、LEFT JOIN 判空柜、退仓口径保留。

---

### Q3 月度进仓时效分层排名（★★★☆☆）

**口径**：完结状态3种 / 耗时=末次入库-创建(小时)

```sql
-- CTE1 完结柜全集 + 归周
WITH finished_container AS (
    SELECT booking_id, container_no, dest_port, create_time, plan_sail_date
    FROM dwd_sea_booking_full
    WHERE container_status IN ('已配柜','已出运','已签收')
      AND del_flag = 0
      AND plan_sail_date >= '2026-07-01' AND plan_sail_date < '2026-08-01'
),
-- CTE2 末次有效入库
last_inbound AS (
    SELECT container_no, MAX(inbound_time) AS last_time
    FROM dwd_sea_goods_inbound_full
    WHERE data_status = '有效' AND del_flag = 0
    GROUP BY container_no
),
-- CTE3 进仓耗时（小时）
inbound_hours AS (
    SELECT f.container_no, f.dest_port, f.plan_sail_date,
           CONCAT('2026-W', LPAD(WEEKOFYEAR(f.plan_sail_date), 2, '0')) AS stat_week,
           ROUND((UNIX_TIMESTAMP(l.last_time) - UNIX_TIMESTAMP(f.create_time)) / 3600, 1) AS inbound_hours
    FROM finished_container f
    LEFT JOIN last_inbound l ON f.container_no = l.container_no
)
-- ④ 分组排名
SELECT stat_week, dest_port, container_no, inbound_hours,
       DENSE_RANK() OVER (PARTITION BY dest_port, stat_week ORDER BY inbound_hours ASC) AS port_week_rank
FROM inbound_hours;
```

**考点**：DENSE_RANK 并列不跳号、UNIX_TIMESTAMP 算小时、WEEKOFYEAR 归周。

---

### Q4 快照数据修正统计（★★★★☆）

**口径**：每日存在性 + 最终状态修正

```sql
-- 最新快照
WITH latest_snapshot AS (
    SELECT booking_id, container_no, del_flag, container_status
    FROM dwd_sea_booking_full
    WHERE dt = '2026-07-31'
)
-- 每日快照 × 最新快照：剔除"后来被删"的历史
SELECT d.dt,
       COUNT(1) AS total_cnt,
       SUM(IF(d.container_status IN ('已出运','已签收'), 1, 0)) AS finish_cnt,
       ROUND(SUM(IF(d.container_status IN ('已出运','已签收'),1,0)) / GREATEST(COUNT(1),1) * 100, 2) AS daily_complete_rate
FROM dwd_sea_booking_full d
JOIN latest_snapshot l
  ON d.booking_id = l.booking_id AND d.container_no = l.container_no
WHERE d.dt >= '2026-07-01' AND d.dt < '2026-08-01'
  AND d.del_flag = 0   -- 当日快照正常
  AND l.del_flag = 0   -- 最终也没被删（口径回溯核心）
GROUP BY d.dt
ORDER BY d.dt;
```

**考点**：自连接（快照×最新）、口径回溯、GREATEST 防除零。

---

### Q5 客户拼柜质量综合评分（★★★★★）

**口径**：Q3三个月 / 拼柜≥2票 / 合规≤5票

```sql
-- CTE1 柜级事实（先收敛！）
WITH container_fact AS (
    SELECT i.container_no,
           COUNT(DISTINCT i.cargo_no) AS ticket_cnt,
           SUM(i.actual_weight)       AS total_w
    FROM dwd_sea_goods_inbound_full i
    WHERE i.data_status = '有效' AND i.del_flag = 0
    GROUP BY i.container_no
),
-- CTE2 客户级指标
cust_metric AS (
    SELECT c.cust_id,
           COUNT(1)                                              AS total_cnt,
           SUM(IF(f.ticket_cnt IS NULL, 1, 0))                    AS empty_cnt,
           SUM(IF(f.ticket_cnt >= 2, 1, 0))                       AS lcl_cnt,      -- 拼柜
           SUM(IF(f.total_w > c.book_weight, 1, 0))               AS over_cnt,
           SUM(IF(f.ticket_cnt IS NOT NULL AND f.ticket_cnt <= 5, 1, 0)) AS compliance_cnt
    FROM dwd_sea_container_full c
    LEFT JOIN container_fact f ON c.container_no = f.container_no
    WHERE c.del_flag = 0 AND c.dt = '2026-09-30'
    GROUP BY c.cust_id
)
-- ③ 综合评分
SELECT cust_id,
       ROUND((1 - empty_cnt/total_cnt) * 40
           + (1 - over_cnt/GREATEST(total_cnt - empty_cnt, 1)) * 30
           + compliance_cnt/total_cnt * 30, 2) AS score
FROM cust_metric;
```

**考点**：两阶段聚合、评分建模、数据倾斜（先收敛 + 加盐 + MapJoin）。

---

## 四、四道思考题 · 口述要点

1. **换柜增量还是全量？** DWD 事实层「增量流水 + 全量快照」双轨；换柜是缓慢变化维，用 change_time 起止时间重放任意时刻，回溯 = `change_time ≤ T < 下次变更`，不回刷历史。
2. **大表倾斜除加盐外？** ① join 前过滤分区/无效状态 ② 分层预聚合到 DWS ③ 小表广播 MapJoin ④ 热点 key 拆桶隔离。
3. **重跑不一致 3 原因？** ① 源端回刷/迟到 ② 快照覆盖口径漂移 ③ 依赖时序读半截。修复：幂等写入 + 就绪校验 + 固定快照口径。
4. **客户宽表拉链表？** `(cust_id, 属性…, start_date, end_date)`；每日增量比对，变化则闭链 + 开新链；查历史 `WHERE start_date ≤ T AND end_date > T`。
