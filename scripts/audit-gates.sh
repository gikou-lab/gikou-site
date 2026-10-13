#!/bin/bash
# 判断の記録（show-me-your-work の TSV）の中で、人の手番（gate）と見直しの指摘（finding）が
# 片付いたかを数える。
# 使い方: scripts/audit-gates.sh .audit/<task>.tsv
# 決まり:
#   - gate の行は decision を「G<id>: 」で始める。閉じる行は phase を gate-closed にし、
#     同じ「G<id>: 」で始め、evidence に人の言葉か操作を書く
#   - finding の行は decision を「F<id>: 」で始める。受ける行は phase を fixed・dismissed・
#     gated のどれかにし、同じ「F<id>: 」で始める（gated は G<id> の gate に移したとき）
#   - 開いた gate か受けていない finding が残ったまま done の行があれば 1 を返す
set -u
f="${1:?tsv path}"
awk -F'\t' '
NR==1 { next }
$2=="gate" && match($3,/^G[^:]+:/) { id=substr($3,1,RLENGTH-1); gate[id]=$3; gorder[++gn]=id; next }
$2=="gate-closed" && match($3,/^G[^:]+:/) { id=substr($3,1,RLENGTH-1); gclosed[id]=$5; next }
$2=="finding" && match($3,/^F[^:]+:/) { id=substr($3,1,RLENGTH-1); fnd[id]=$3; forder[++fn]=id; next }
($2=="fixed" || $2=="dismissed" || $2=="gated") && match($3,/^F[^:]+:/) { id=substr($3,1,RLENGTH-1); fres[id]=$2 ": " $5; next }
$2=="done" { done=1 }
END {
  bad=0
  for (i=1;i<=gn;i++) { id=gorder[i]
    if (id in gclosed) printf "CLOSED   %s  (by: %s)\n", gate[id], gclosed[id]
    else { printf "OPEN     %s\n", gate[id]; bad=1 } }
  for (i=1;i<=fn;i++) { id=forder[i]
    if (id in fres) printf "HANDLED  %s  (%s)\n", fnd[id], fres[id]
    else { printf "PENDING  %s\n", fnd[id]; bad=1 } }
  if (gn==0 && fn==0) print "no gates (G<id>:) or findings (F<id>:)"
  if (bad && done) { print "FAIL: done の行があるのに、開いた gate か受けていない finding がある"; exit 1 }
  if (bad) { print "WAIT: 開いた gate か受けていない finding がある"; exit 2 }
  print "OK"
}' "$f"
