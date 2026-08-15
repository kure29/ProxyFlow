import type { RouteId, RouteTargetIR, ServiceId } from './references'

export interface ServiceMatcherIR { kind: 'service'; serviceIds: ServiceId[] }
export interface DomainMatcherIR { kind: 'domain'; value: string }
export interface DomainSuffixMatcherIR { kind: 'domain-suffix'; value: string }
export interface DomainKeywordMatcherIR { kind: 'domain-keyword'; value: string }
export interface IpCidrMatcherIR { kind: 'ip-cidr'; value: string }
export interface IpCidr6MatcherIR { kind: 'ip-cidr6'; value: string }
export interface AsnMatcherIR { kind: 'asn'; value: number }
export interface GeoIpMatcherIR { kind: 'geo-ip'; countryCode: string }
export interface GeoSiteMatcherIR { kind: 'geo-site'; category: string }
export interface RuleSetMatcherIR { kind: 'rule-set'; id: string }

export type TrafficMatcherIR =
  | ServiceMatcherIR
  | DomainMatcherIR
  | DomainSuffixMatcherIR
  | DomainKeywordMatcherIR
  | IpCidrMatcherIR
  | IpCidr6MatcherIR
  | AsnMatcherIR
  | GeoIpMatcherIR
  | GeoSiteMatcherIR
  | RuleSetMatcherIR

export interface RouteIR {
  id: RouteId
  name: string
  matcher: TrafficMatcherIR
  target: RouteTargetIR
  priority: number
}

export interface FinalRouteIR {
  target: RouteTargetIR
}
