#!/bin/bash
# 判断の記録（show-me-your-work の TSV）の中で、人の手番（gate）が人の答えで閉じたかを数える。
# 使い方: scripts/audit-gates.sh .audit/<task>.tsv
# 決まり: gate の行は decision を「G<id>: 」で始める。閉じる行は phase を gate-closed にし、
# 同じ「G<id>: 」で始め、evidence に人の言葉か操作を書く。閉じていない gate が残ったまま
# done の行があれば 1 を返す。
set -u
f="${1:?tsv path}"
awk -F'\t' -v OFS='\t' '
NR==1 { next }
$2=="gate" && match($3,/^G[^:]+:/) { id=substr($3,1,RLENGTH-1); open[id]=$3; order[++n]=id; next }
$2=="gate-closed" && match($3,/^G[^:]+:/) { id=substr($3,1,RLENGTH-1); closed[id]=$5; next }
$2=="done" { done=1 }
END {
  bad=0
  for (i=1;i<=n;i++) { id=order[i]
    if (id in closed) printf "CLOSED  %s  (by: %s)\n", open[id], closed[id]
    else { printf "OPEN    %s\n", open[id]; bad=1 } }
  if (n==0) print "no gates with G<id>: prefix"
  if (bad && done) { print "FAIL: done の行があるのに閉じていない gate がある"; exit 1 }
  if (bad) { print "WAIT: 閉じていない gate がある"; exit 2 }
  print "OK"
}' "$f"
