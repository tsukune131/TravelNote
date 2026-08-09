#!/usr/bin/env bash
# match の git 認証だけを、CI と同じ方法で手元から試す。
#
#   bash scripts/check-match-auth.sh
#
# 「Repository not found」は Private リポジトリでは **権限が無い** の意味。
# 原因は URL とトークンのどちらか、あるいは base64 の作り方。
# ここで切り分ける。**PAT は画面に出さないし、どこにも保存しない。**
set -u

USER_NAME=tsukune131

printf 'PAT を貼り付け(表示されません): '
read -rs PAT
echo

if [ -z "${PAT}" ]; then
  echo "何も入力されていません"
  exit 2
fi

# CI(fastlane match)がやっているのと同じ組み立て
AUTH=$(printf '%s:%s' "$USER_NAME" "$PAT" | base64 -w0)

echo
echo "── base64 の形 ──"
LINES=$(printf '%s' "$AUTH" | wc -l)
echo "  長さ: ${#AUTH} 文字 / 改行: ${LINES}"
if [ "$LINES" -ne 0 ]; then
  echo "  ✗ 改行が混ざっている。Authorization ヘッダが壊れる"
  echo "    → base64 に -w0 を付ける(PowerShell の ToBase64String なら改行は入らない)"
fi

echo
echo "── この PAT からどのリポジトリが見えるか ──"
for R in VitaNote-certificates TravelNote-certificates VitaNote TravelNote; do
  printf '  %-26s ' "$R"
  if git -c http.extraheader="Authorization: Basic ${AUTH}" \
       ls-remote "https://github.com/${USER_NAME}/${R}.git" >/dev/null 2>&1; then
    echo "見える ✓"
  else
    echo "見えない ✗"
  fi
done

echo
echo "── 判定 ──"
echo "  MATCH_GIT_URL が指すリポジトリが「見える ✓」になっていれば、認証は正しい。"
echo "  そこが ✗ なら、PAT の Repository access にそのリポジトリを追加するか、"
echo "  MATCH_GIT_URL を「見える ✓」のほうへ向け直す。"
echo
echo "  いま設定すべき値: https://github.com/${USER_NAME}/VitaNote-certificates.git"

unset PAT AUTH
