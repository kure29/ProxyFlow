export const hktDemoSubscription = [
  'ss://YWVzLTEyOC1nY206ZGVtby1oay1wYXNz@hk-ss.example.com:8388#🇭🇰%20香港%20SS%2001',
  'vmess://eyJ2IjoiMiIsInBzIjoi8J+HrfCfh7Ag6aaZ5rivIFZNZXNzIDAyIiwiYWRkIjoiaGstdm1lc3MuZXhhbXBsZS5jb20iLCJwb3J0IjoiNDQzIiwiaWQiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJhaWQiOiIwIiwic2N5IjoiYXV0byIsInRscyI6InRscyIsInNuaSI6ImhrLXZtZXNzLmV4YW1wbGUuY29tIiwibmV0Ijoid3MiLCJob3N0IjoiaGstdm1lc3MuZXhhbXBsZS5jb20iLCJwYXRoIjoiL3dzIn0=',
  'vless://33333333-3333-4333-8333-333333333333@hk-vless.example.com:443?security=tls&sni=hk-vless.example.com&type=ws&path=%2Fvless&host=hk-vless.example.com#🇭🇰%20香港%20VLESS%2003',
  'trojan://demo-hk-trojan@hk-trojan.example.com:443?sni=hk-trojan.example.com&type=tcp#🇭🇰%20香港%20Trojan%2004',
  'socks5://demo:demo-pass@hk-socks.example.com:1080#🇭🇰%20香港%20SOCKS%2005',
  'http://demo:demo-pass@hk-http.example.com:8080#🇭🇰%20香港%20HTTP%2006',
].join('\n')

export const usDemoSubscription = [
  'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXVzLXBhc3M=@us-ss.example.com:8388#🇺🇸%20美国%20SS%2001',
  'vmess://eyJ2IjoiMiIsInBzIjoi8J+HuvCfh7gg576O5Zu9IFZNZXNzIDAyIiwiYWRkIjoidXMtdm1lc3MuZXhhbXBsZS5jb20iLCJwb3J0IjoiNDQzIiwiaWQiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIiLCJhaWQiOiIwIiwic2N5IjoiYXV0byIsInRscyI6InRscyIsInNuaSI6InVzLXZtZXNzLmV4YW1wbGUuY29tIiwibmV0Ijoid3MiLCJob3N0IjoidXMtdm1lc3MuZXhhbXBsZS5jb20iLCJwYXRoIjoiL3dzIn0=',
  'vless://44444444-4444-4444-8444-444444444444@us-vless.example.com:443?security=tls&sni=us-vless.example.com&type=grpc&serviceName=proxyflow#🇺🇸%20美国%20VLESS%2003',
  'trojan://demo-us-trojan@us-trojan.example.com:443?sni=us-trojan.example.com&type=tcp#🇺🇸%20美国%20Trojan%2004',
  'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpkZW1vLXVzLXBhc3M=@us-ss.example.com:8388#🇺🇸%20美国%20SS%20Duplicate',
].join('\n')
