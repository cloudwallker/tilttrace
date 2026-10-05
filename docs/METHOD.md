# Method / 计算方法

[English README](../README.md) · [中文说明](../README_ZH.md)

## Model

Criterion weights are percentage points: $w_i \geq 0$ and $\sum_i w_i = 100$. Scores $s_{ai}$ are fixed subjective ratings in $[0,10]$, with higher always better. An option's score is

$$S_a(w)=\frac{1}{100}\sum_i w_i s_{ai}.$$

For one analysis, let $L$ be its baseline leader and $C$ a challenger. Define $d_i=s_{Ci}-s_{Li}$. A feasible witness $v$ has nonnegative weights totaling 100 and preserves every locked weight. TiltTrace solves

$$\min_v T(w,v)=\frac12\sum_i |v_i-w_i|\quad\text{subject to}\quad\sum_i v_i d_i\geq0.$$

The target is **catching the baseline leader**, not making the challenger the best of all options. No constraints are imposed against the other options. An already tied challenger has distance zero.

## Units and witnesses

$T$ is total variation measured in **percentage points (pp)**. A transfer of 3 pp changes two weights by 3 each; its distance is 3 pp. If weights are represented as proportions totaling 1, total variation is $T/100$.

The returned `witness` contains full-precision weights. `transfers` records donor, recipient, and amount. Each transfer of $t$ pp from $i$ to $j$ improves the challenger's unnormalized margin by $t(d_j-d_i)$, or its score margin by $t(d_j-d_i)/100$.

## Why the greedy transport is minimal

Let $F$ be the total unlocked weight and let $d_{\max}$ be the largest unlocked score difference. All unlocked mass can fit on a criterion attaining $d_{\max}$: its required final weight is $F\leq100$. Therefore there is an optimal redistribution that sends removed mass to a best recipient. Sending it elsewhere cannot improve the margin more for the same transfer distance.

For such a recipient, one pp removed from donor $i$ gains $d_{\max}-d_i$. Spend the transfer budget on donors in ascending $d_i$ order, up to each donor's available weight. An exchange argument establishes optimality: replacing any amount removed from a less productive donor with available mass from a more productive donor weakly increases gain without increasing distance. Repeat until no such exchange remains.

This gives the greatest achievable margin improvement for every transfer budget. The first point at which that piecewise-linear improvement closes the starting deficit is consequently the minimum distance. The final transfer may be fractional. Locked contributions remain constant throughout. The engine represents this process as sorted donor/recipient transport.

This proof uses the app's specific constraints: nonnegative weights, total 100, fixed locks, and no additional per-criterion bounds or group constraints.

## Reachability, strict advantage, and ties

With at least one unlocked criterion, the greatest possible challenger advantage is

$$A_{\max}=\frac{\sum_{i\text{ locked}}w_i d_i+F d_{\max}}{100}.$$

With no unlocked criteria, it is simply the current advantage. The engine uses a score-margin tolerance of `1e-9` (`1e-7` for the unnormalized margin). Subject to that tolerance:

- `reachable = false`: $A_{\max}<0$; no catch-up witness exists, so `distance` and `witness` are `null`.
- `reachable = true`, `canWin = false`: equality is achievable, but a strict advantage is not (**tie-only**).
- `canWin = true`: some feasible weights make the challenger strictly exceed the baseline leader. The minimum-distance witness still stops at equality.

Strictly exceeding the baseline leader does not establish a global win. The replayed full ranking is the check for that. If several options currently tie, the baseline leader is selected by their original order; equal scores remain a tie, regardless of display order.

## Hand calculation

For the workplace example, Shared hub minus Home desk gives $d=[1,-2,-3,6]$. At $w=[40,30,20,10]$, the unnormalized margin is $-20$ (score margin $-0.2$). The most productive unlocked transfer is Commute to Flexibility, gaining $6-(-3)=9$ per pp. Thus the catch-up distance is $20/9\approx2.222222$ pp, within Commute's 20 pp supply.

The witness is $[40,30,160/9,110/9]$. Both options score $643/90\approx7.144444$. This is a boundary tie; a slightly larger transfer can strictly favor Shared hub.

## Limits

- Scores and criteria are supplied by the user. The calculation tests weight sensitivity with scores held fixed; it does not establish objective quality, probability, or confidence.
- All scores use one higher-is-better 0–10 scale. Convert costs into ratings before entry; the app does not infer utilities or reverse score directions.
- Floating-point arithmetic uses small tolerances. Rounded displayed weights can shift a boundary slightly; use the full witness for replay.
- Version 1 accepts 2–8 criteria, 2–8 options, and JSON files up to 64 KiB. Weights total 100 within `1e-7`; invalid values and unknown versions are rejected.
- Data remains in memory. There are no app network requests or persistent browser storage; export JSON to save a model.

加权决策、敏感性分析及相关优化思想均已有先例。TiltTrace 的定位是零依赖离线交互、固定总和、锁定、最小转移和可复验见证的产品组合，不声称算法创新。
