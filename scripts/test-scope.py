import json, urllib.request, urllib.error, sys

# 环境里有 HTTP_PROXY，必须显式禁用，否则 localhost 请求会被代理拦截
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(opener)

API = "http://127.0.0.1:3001"
ACCOUNT = "jiangwucheng"
PASSWORD = "jiangwucheng@2026118"


def req(path, token=None, method="GET", data=None):
    url = API + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["x-auth-token"] = token
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=180)
        raw = resp.read().decode()
        return resp.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:200]}
    except Exception as e:
        return 0, {"error": str(e)}


# 登录
status, data = req("/api/auth/login", method="POST",
                   data={"account": ACCOUNT, "password": PASSWORD})
assert status == 200, (status, data)
token = data["token"]
user = data["user"]
print(f"登录: {user['account']} 角色={user['role']} 乡镇={user['town']} "
      f"必须改密={data.get('mustChangePassword')}")
print("=" * 70)

results = []


def check(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}: {detail}")


# 1 青少年列表
status, d = req("/api/youth", token)
recs = d.get("records", [])
units = set(r.get("responsibleUnit") for r in recs)
check("青少年信息-列表条数", status == 200 and len(recs) == 118,
      f"HTTP {status}, {len(recs)} 条, 归口单位={units}")
check("青少年信息-越乡泄漏", units <= {"讲武城镇"}, f"出现单位 {units}")

st = d.get("statistics", {})
check("青少年信息-统计按镇", st.get("total") == 118,
      f"statistics.total={st.get('total')}")

# 2 refresh
status, d = req("/api/youth/refresh", token)
recs2 = d.get("records", [])
units2 = set(r.get("responsibleUnit") for r in recs2)
check("刷新接口-按镇过滤", status == 200 and len(recs2) == 118 and units2 <= {"讲武城镇"},
      f"HTTP {status}, {len(recs2)} 条, 归口单位={units2}")

# 本镇 / 外镇 id
own_id = recs[0]["key"]
other_id = json.load(open("/tmp/other.json"))["other_id"]
print(f"  （本镇示例 Id={own_id}，外镇示例 Id={other_id}）")

# 3 风险排查
status, d = req(f"/api/youth/{own_id}/risks", token)
n = len(d.get("records", d.get("risks", [])))
check("风险排查-本镇可读", status == 200, f"HTTP {status}, {n} 条风险记录")

status, d = req(f"/api/youth/{other_id}/risks", token)
check("风险排查-外镇拦截", status == 403, f"HTTP {status}, {d.get('message','')}")

# 4 帮扶三类子表
for kind, label in [("pairings", "结对帮扶"), ("help-needs", "帮扶需求"),
                    ("help-records", "帮扶记录")]:
    status, d = req(f"/api/youth/{own_id}/{kind}", token)
    n = len(d.get("records", []))
    check(f"帮扶管理-本镇{label}", status == 200, f"HTTP {status}, {n} 条")

    status, d = req(f"/api/youth/{other_id}/{kind}", token)
    check(f"帮扶管理-外镇{label}拦截", status == 403,
          f"HTTP {status}, {d.get('message','')}")

# 5 帮扶总览
status, d = req("/api/help/summary", token)
s = d.get("summary", {})
check("帮扶管理-总览统计", status == 200 and s.get("pairingTotal", 0) > 0,
      f"HTTP {status}, 结对总数={s.get('pairingTotal')}, "
      f"已结对={s.get('pairedCount')}, 需求={s.get('needTotal')}, "
      f"帮扶记录={s.get('recordTotal')}")

# 6 统计页（前端算，但后端 statistics 要正确）
status, d = req("/api/youth", token)
st = d.get("statistics", {})
check("统计模块-数据范围", status == 200 and st.get("total") == 118,
      f"total={st.get('total')}, 需帮扶={st.get('needHelpCount')}, "
      f"风险={st.get('riskCount')}, 结对={st.get('pairingCount')}")

# 7 系统管理（乡镇应 403）
for path, label in [("/api/auth/accounts", "账号管理"),
                    ("/api/system/logs", "操作日志"),
                    ("/api/system/recycle", "回收站")]:
    status, d = req(path, token)
    check(f"系统管理-{label}拦截", status == 403,
          f"HTTP {status}, {d.get('message','')}")

# 8 未登录
status, d = req("/api/youth")
check("未鉴权拦截", status == 401, f"HTTP {status}, {d.get('message','')}")

print("=" * 70)
bad = [r for r in results if not r[1]]
print(f"通过 {len(results) - len(bad)}/{len(results)}")
for name, _, detail in bad:
    print(f"  未通过 -> {name}: {detail}")
