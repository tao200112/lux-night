#!/usr/bin/env python3
"""Daily Christiansburg housing digest using OpenAI web search + Gmail SMTP."""

from __future__ import annotations

import argparse
import json
import os
import smtplib
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from typing import Any


OPENAI_API_URL = "https://api.openai.com/v1/responses"


@dataclass
class Config:
    openai_api_key: str
    gmail_user: str
    gmail_app_password: str
    recipients: list[str]
    model: str
    run_date: str


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config(run_date: str) -> Config:
    recipients_raw = os.getenv(
        "HOUSING_RECIPIENTS", "ridiculouschickenblacksburg@gmail.com"
    )
    recipients = [item.strip() for item in recipients_raw.split(",") if item.strip()]
    if not recipients:
        raise RuntimeError("HOUSING_RECIPIENTS is empty")

    return Config(
        openai_api_key=require_env("OPENAI_API_KEY"),
        gmail_user=require_env("GMAIL_SMTP_USER"),
        gmail_app_password=require_env("GMAIL_SMTP_APP_PASSWORD"),
        recipients=recipients,
        model=os.getenv("OPENAI_MODEL", "gpt-5"),
        run_date=run_date,
    )


def build_prompt(run_date: str) -> str:
    return f"""
你是一个负责每天筛选 Christiansburg, VA 员工宿舍房源的研究助理。今天日期是 {run_date}。

任务：
搜索 Christiansburg, VA / 24073 附近适合购买作为餐馆员工宿舍的便宜房源，并输出一封可以直接发邮件的中文正文。

必须优先搜索和引用这些来源：
- Redfin
- Zillow
- Realtor.com
- NRVMLS
- 本地 realtor 网站
- Montgomery County Property Search
- Christiansburg GIS / zoning 页面

餐馆地址：
- 1635 N Franklin St, Christiansburg, VA 24073

现有宿舍基准（用于对比）：
- 地址：60 Second St SW, Christiansburg, VA 24073
- 2,284 sqft
- 3 bed / 2 bath
- Year built 1854, effective 1940, remodeled 1995
- Fair condition
- Electric baseboard / utility cost high
- 这是一个“太老、太耗水电”的反面基准

硬筛选条件：
1. 只看 active / for sale 房源，明确排除 sold / pending / contingent。
2. 价格优先 200k-280k，最高不超过 300k。
3. 房型优先 single-family house / townhouse / duplex。
4. 至少 3 bedrooms，最好 2 bathrooms。
5. 面积必须大于 1,600 sqft。
6. 必须有中央空调；如果来源写明 central air 或 heat pump cooling，视为符合。
7. 优先 town/public water + sewer、较新 HVAC、较新热水器、较新电气系统。
8. 避免 electric baseboard heat、oil heat、propane heat、septic、well water、mobile/manufactured home、只有 1 bathroom、大草坪、明显老房大修。
9. 到餐馆地址的正常车程不能超过 40 分钟。
10. 不要假设能住很多 unrelated employees。每套都必须标记 zoning / occupancy 需要向 Christiansburg Planning/Zoning 确认。

筛选优先级：
- 只推送今天真正值得看的内容：新出现、降价、或虽然不是新盘但明显优于现有宿舍、值得继续看。
- 如果今天没有值得看的新房源，正文必须只输出这一句，不要加别的内容：
今天没有值得看的新房源。

如果有候选房源：
- 最多输出 5 套。
- 每套必须写：
  - 地址或大概位置
  - 当前状态（active / new / price cut 等）
  - 价格
  - bedrooms / bathrooms / sqft
  - year built
  - 到餐馆的大致车程
  - estimated monthly cost
  - utility 风险
  - 员工宿舍适配评分 1-10
  - 法律/zoning 风险
  - 为什么值得看
  - 为什么可能不值得买
  - 与现有宿舍对比：
    - 房龄/整体新旧
    - 供暖制冷和预估水电负担
    - 面积和 bed/bath
    - 到餐馆车程
  - listing 链接（尽量给直接房源链接）
  - 结论：Buy / Watch / Skip

输出格式要求：
- 直接输出邮件正文。
- 使用中文。
- 保持清晰、简洁、可直接发送。
- 不要输出 JSON。
- 不要虚构信息；如果某个字段无法确认，要明确写“公开资料未确认”。
""".strip()


def extract_output_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    parts: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts).strip()


def generate_email_body(config: Config) -> str:
    body = {
        "model": config.model,
        "reasoning": {"effort": "medium"},
        "tools": [
            {
                "type": "web_search",
                "user_location": {
                    "type": "approximate",
                    "country": "US",
                    "region": "Virginia",
                    "city": "Christiansburg",
                    "timezone": "America/New_York",
                },
            }
        ],
        "tool_choice": "auto",
        "include": ["web_search_call.action.sources"],
        "input": build_prompt(config.run_date),
    }

    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        OPENAI_API_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.openai_api_key}",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenAI API request failed: {exc}") from exc

    output = extract_output_text(payload)
    if not output:
        raise RuntimeError("OpenAI response did not include output_text")
    return output


def send_email(config: Config, body: str) -> None:
    message = EmailMessage()
    message["From"] = config.gmail_user
    message["To"] = ", ".join(config.recipients)
    message["Subject"] = f"Christiansburg 员工宿舍房源筛选 - {config.run_date}"
    message.set_content(body)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(config.gmail_user, config.gmail_app_password)
        smtp.send_message(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y-%m-%d"),
        help="Run date to embed in the email subject and prompt (default: today).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate the email body and print it instead of sending.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        config = load_config(args.date)
        body = generate_email_body(config)
    except Exception as exc:  # noqa: BLE001
        print(f"[christiansburg] failed before send: {exc}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(body)
        return 0

    try:
        send_email(config, body)
    except Exception as exc:  # noqa: BLE001
        print(f"[christiansburg] email send failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"[christiansburg] sent {args.date} digest to {', '.join(config.recipients)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
