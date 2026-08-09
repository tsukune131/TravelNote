# match の git 認証だけを、CI と同じ方法で手元から試す。
#
#   powershell -ExecutionPolicy Bypass -File scripts\check-match-auth.ps1
#
# 「Repository not found」は Private リポジトリでは **権限が無い** の意味
# (GitHub は存在を隠すため 403 ではなく 404 を返す)。
# 原因は URL とトークンのどちらか。ここで切り分ける。
# **PAT は画面に出さないし、どこにも保存しない。**

$ErrorActionPreference = 'Stop'
$UserName = 'tsukune131'

$sec = Read-Host -Prompt 'PAT を貼り付け(表示されません)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $pat = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($pat)) {
  Write-Host '何も入力されていません'
  exit 2
}

# CI(fastlane match)がやっているのと同じ組み立て。
# .NET の ToBase64String は改行を入れないので、ここでは折り返しの心配はない
$auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${UserName}:${pat}"))

Write-Host ''
Write-Host '-- base64 の形 --'
Write-Host ("  長さ: {0} 文字 / 改行: {1}" -f $auth.Length, ([regex]::Matches($auth, "`n").Count))

Write-Host ''
Write-Host '-- この PAT からどのリポジトリが見えるか --'
foreach ($r in @('VitaNote-certificates', 'TravelNote-certificates', 'VitaNote', 'TravelNote')) {
  $url = "https://github.com/$UserName/$r.git"
  git -c "http.extraheader=Authorization: Basic $auth" ls-remote $url *> $null
  if ($LASTEXITCODE -eq 0) {
    $mark = '見える OK'
  } else {
    $mark = '見えない NG'
  }
  Write-Host ("  {0,-26} {1}" -f $r, $mark)
}

Write-Host ''
Write-Host '-- 判定 --'
Write-Host '  MATCH_GIT_URL が指すリポジトリが「見える OK」なら、認証は正しい。'
Write-Host '  そこが NG なら、PAT の Repository access にそのリポジトリを足すか、'
Write-Host '  MATCH_GIT_URL を「見える OK」のほうへ向け直す。'
Write-Host ''
Write-Host "  いま設定すべき値: https://github.com/$UserName/VitaNote-certificates.git"

$pat = $null
$auth = $null
