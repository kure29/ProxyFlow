export const hktDemoSubscription = [
  'ss://YWVzLTEyOC1nY206ZGVtby1oay1wYXNz@hk-ss.example.com:8388#🇭🇰%20HK%20SS%2001',
  'vmess://eyJ2IjoiMiIsInBzIjoiSEsgVk1lc3MgMDIiLCJhZGQiOiJoay12bWVzcy5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwidGxzIjoidGxzIiwic25pIjoiaGstdm1lc3MuZXhhbXBsZS5jb20iLCJuZXQiOiJ3cyIsImhvc3QiOiJoay12bWVzcy5leGFtcGxlLmNvbSIsInBhdGgiOiIvd3MifQ==',
  'vless://33333333-3333-4333-8333-333333333333@hk-vless.example.com:443?security=tls&sni=hk-vless.example.com&type=ws&path=%2Fvless&host=hk-vless.example.com#🇭🇰%20HK%20VLESS%2003',
  'trojan://demo-hk-trojan@hk-trojan.example.com:443?sni=hk-trojan.example.com&type=tcp#🇭🇰%20HK%20Trojan%2004',
  'socks5://demo:demo-pass@hk-socks.example.com:1080#🇭🇰%20HK%20SOCKS%2005',
  'http://demo:demo-pass@hk-http.example.com:8080#🇭🇰%20HK%20HTTP%2006',
].join('\n')

export const usDemoSubscription = [
  'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXVzLXBhc3M=@us-ss.example.com:8388#🇺🇸%20US%20SS%2001',
  'vmess://eyJ2IjoiMiIsInBzIjoiVVMgVk1lc3MgMDIiLCJhZGQiOiJ1cy12bWVzcy5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6IjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwidGxzIjoidGxzIiwic25pIjoidXMtdm1lc3MuZXhhbXBsZS5jb20iLCJuZXQiOiJ3cyIsImhvc3QiOiJ1cy12bWVzcy5leGFtcGxlLmNvbSIsInBhdGgiOiIvd3MifQ==',
  'vless://44444444-4444-4444-8444-444444444444@us-vless.example.com:443?security=tls&sni=us-vless.example.com&type=grpc&serviceName=proxyflow#🇺🇸%20US%20VLESS%2003',
  'trojan://demo-us-trojan@us-trojan.example.com:443?sni=us-trojan.example.com&type=tcp#🇺🇸%20US%20Trojan%2004',
  'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXVzLXBhc3M=@us-ss.example.com:8388#🇺🇸%20US%20SS%20Duplicate',
].join('\n')
