#!/bin/bash

echo "=== Testing GMGN Endpoint ==="
curl -s -I "https://gmgn.ai/defi/quotation/v1/rank/robinhood/swaps/5m?orderby=volume&direction=desc" \
  -H "Referer: https://gmgn.ai/" \
  -H "Origin: https://gmgn.ai" \
  -H "Accept-Language: en-US,en;q=0.9" | head -15

echo ""
echo "=== Testing BasedBot Endpoint ==="
curl -s -I "https://basedbot.app/?chain=robinhood" \
  -H "Referer: https://basedbot.app/" \
  -H "Accept-Language: en-US,en;q=0.9" | head -15

echo ""
echo "=== Testing DYOR.fun (no public API known, checking main page) ==="
curl -s -I "https://dyor.fun/" | head -15

echo ""
echo "=== GMGN Full Response Test (first 500 chars) ==="
curl -s "https://gmgn.ai/defi/quotation/v1/rank/robinhood/swaps/5m?orderby=volume&direction=desc" \
  -H "Referer: https://gmgn.ai/" \
  -H "Origin: https://gmgn.ai" \
  -H "Accept-Language: en-US,en;q=0.9" | head -c 500

echo ""
echo "=== BasedBot Full Response Test (first 1000 chars) ==="
curl -s "https://basedbot.app/?chain=robinhood" \
  -H "Referer: https://basedbot.app/" \
  -H "Accept-Language: en-US,en;q=0.9" | head -c 1000