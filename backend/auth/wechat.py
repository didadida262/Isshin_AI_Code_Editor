"""
微信 OAuth 2.0 (snsapi_login) 登录路由

环境变量配置：
  WECHAT_APPID      —— 微信开放平台 AppID
  WECHAT_APPSECRET  —— 微信开放平台 AppSecret
  WECHAT_CALLBACK_BASE —— 回调地址前缀，默认 http://127.0.0.1:8788

微信开放平台配置要求：
  1. 登录 https://open.weixin.qq.com 创建网站应用
  2. 在「网站信息」中填写授权回调域：127.0.0.1
  3. 将 AppID / AppSecret 填入上述环境变量

端点：
  GET /auth/wechat/init           —— 创建 session，返回二维码 URL
  GET /auth/wechat/callback       —— 微信授权回调（redirect_uri）
  GET /auth/wechat/poll/{state}   —— 前端轮询登录状态
  DELETE /auth/wechat/session/{state} —— 登出
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import uuid

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/auth/wechat", tags=["auth"])

APPID = os.environ.get("WECHAT_APPID", "")
APPSECRET = os.environ.get("WECHAT_APPSECRET", "")
CALLBACK_BASE = os.environ.get("WECHAT_CALLBACK_BASE", "http://127.0.0.1:8788")

# In-memory session store: state -> { status, user?, created_at, error? }
_sessions: dict[str, dict] = {}
_SESSION_TTL = 600  # 10 分钟


def _purge_expired() -> None:
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v["created_at"] > _SESSION_TTL]
    for k in expired:
        del _sessions[k]


# ── 端点 ──────────────────────────────────────────────────────────────────


@router.get("/init")
def init_session() -> dict:
    """
    创建新的微信登录 session。

    返回：
      state       —— 本次登录唯一标识符
      qrcode_url  —— 嵌入 iframe 的微信二维码页面 URL
      configured  —— 是否已配置 WECHAT_APPID（false 时前端展示配置提示）
    """
    _purge_expired()
    state = uuid.uuid4().hex
    _sessions[state] = {"status": "pending", "created_at": time.time()}

    redirect_uri = f"{CALLBACK_BASE}/auth/wechat/callback"
    redirect_uri_encoded = urllib.parse.quote(redirect_uri, safe="")

    qrcode_url = (
        f"https://open.weixin.qq.com/connect/qrconnect"
        f"?appid={APPID}"
        f"&redirect_uri={redirect_uri_encoded}"
        f"&response_type=code"
        f"&scope=snsapi_login"
        f"&state={state}"
        f"&self_redirect=true"
        f"#wechat_redirect"
    )

    return {
        "state": state,
        "qrcode_url": qrcode_url,
        "configured": bool(APPID and APPSECRET),
    }


@router.get("/callback")
async def wechat_callback(code: str = "", state: str = "") -> HTMLResponse:
    """
    微信授权回调端点（即 redirect_uri）。
    微信在用户扫码确认后重定向至此，携带 code 和 state 参数。
    此端点完成 code→access_token→userinfo 的换取，并通过 postMessage 通知前端 iframe。
    """
    if not state or state not in _sessions:
        return HTMLResponse(_build_callback_page("failed", None, "无效的 state 参数"))

    if not code:
        _sessions[state]["status"] = "failed"
        _sessions[state]["error"] = "未收到授权 code"
        return HTMLResponse(_build_callback_page("failed", None, "未收到授权 code"))

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: code → access_token + openid
            token_resp = await client.get(
                "https://api.weixin.qq.com/sns/oauth2/access_token",
                params={
                    "appid": APPID,
                    "secret": APPSECRET,
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
            token_data = token_resp.json()

        if "errcode" in token_data:
            err = token_data.get("errmsg", "授权失败")
            _sessions[state].update({"status": "failed", "error": err})
            return HTMLResponse(_build_callback_page("failed", None, err))

        access_token = token_data["access_token"]
        openid = token_data["openid"]

        # Step 2: access_token + openid → userinfo
        async with httpx.AsyncClient(timeout=15) as client:
            info_resp = await client.get(
                "https://api.weixin.qq.com/sns/userinfo",
                params={
                    "access_token": access_token,
                    "openid": openid,
                    "lang": "zh_CN",
                },
            )
            user_info = info_resp.json()

        user = {
            "openid": openid,
            "nickname": user_info.get("nickname", "微信用户"),
            "avatar": user_info.get("headimgurl", ""),
            "access_token": access_token,
        }
        _sessions[state].update({"status": "success", "user": user})
        return HTMLResponse(_build_callback_page("success", user, None))

    except Exception as exc:
        err = str(exc)
        _sessions[state].update({"status": "failed", "error": err})
        return HTMLResponse(_build_callback_page("failed", None, err))


@router.get("/poll/{state}")
def poll_status(state: str) -> dict:
    """轮询指定 state 的登录状态。"""
    session = _sessions.get(state)
    if not session:
        return {"status": "not_found"}
    result: dict = {"status": session["status"]}
    if session.get("user"):
        result["user"] = session["user"]
    if session.get("error"):
        result["error"] = session["error"]
    return result


@router.delete("/session/{state}")
def delete_session(state: str) -> dict:
    """删除 session，用于登出。"""
    _sessions.pop(state, None)
    return {"ok": True}


# ── 私有工具 ──────────────────────────────────────────────────────────────


def _build_callback_page(status: str, user: dict | None, error: str | None) -> str:
    """
    微信回调后返回给 iframe 的 HTML 页面。
    通过 window.parent.postMessage 将结果通知给外层 React 应用。
    """
    payload = json.dumps(
        {
            "type": "wechat_oauth",
            "status": status,
            "user": user or {},
            "error": error or "",
        },
        ensure_ascii=False,
    )

    if status == "success":
        icon = "✅"
        body_text = "登录成功，正在返回应用…"
    else:
        icon = "❌"
        body_text = f"登录失败：{error or '未知错误'}"

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>微信登录回调</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #ffffff; color: #333;
    }}
    .card {{ text-align: center; padding: 2rem; }}
    .icon {{ font-size: 3rem; margin-bottom: 1rem; }}
    p {{ font-size: 0.9rem; color: #666; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <p>{body_text}</p>
  </div>
  <script>
    var payload = {payload};
    if (window.parent && window.parent !== window) {{
      window.parent.postMessage(payload, '*');
    }}
    if (window.opener) {{
      window.opener.postMessage(payload, '*');
    }}
  </script>
</body>
</html>"""
