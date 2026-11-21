/** Types shared by the API client, the method catalog and the MCP tools. */

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiMethod {
  id: string;
  name: string;
  description: string;
  returns: string;
  write: boolean;
  deprecated: boolean;
  params: ApiParam[];
}

export type Currency = "EUR" | "TON" | "XTR";

export type Placement = "channel_post" | "bot_banner" | "search_result" | "video_banner";

export type AdStatus =
  "stopped" | "ready_for_review" | "on_review" | "declined" | "active" | "on_hold";

export type ButtonType =
  | "subscribe"
  | "view"
  | "read"
  | "learn_more"
  | "download"
  | "open"
  | "sign_up"
  | "buy"
  | "order"
  | "play"
  | "try"
  | "leave_request";

export interface Account {
  account_id: string;
  title?: string;
  currency: Currency;
  spent_budget?: number;
  remaining_budget?: number;
  ads_budget?: number;
}

export interface AccountInfo {
  account_id: string;
  title?: string;
  full_name?: string;
  email?: string;
  phone_number?: string;
  country?: string;
  city?: string;
  legal_name?: string;
}

export interface RelatedAccountsList {
  total_count: number;
  accounts: Account[];
}

export interface AdPhoto {
  photo_id: string;
  photo_url?: string;
}

export interface AdVideo {
  video_id: string;
  video_url?: string;
}

export interface WebsitePhoto {
  photo_id: string;
  photo_url?: string;
}

export interface AdSchedule {
  week_hours_mask: number[];
  timezone?: number;
  use_viewer_timezone?: boolean;
}

export interface DeclineReason {
  text?: string;
  description_html?: string;
}

export interface AdTargetChannel {
  channel_id: number;
  title?: string;
  username?: string;
  photo_url?: string;
}

export interface AdTargetBot {
  bot_id: number;
  title?: string;
  username?: string;
  photo_url?: string;
}

export interface Ad {
  ad_id: number;
  title: string;
  currency: Currency;
  text?: string;
  photo?: AdPhoto;
  video?: AdVideo;
  promote_url: string;
  cpm: number;
  placement: Placement;
  target?: Record<string, unknown>;
  impression_frequency?: number;
  website_name?: string;
  website_photo?: WebsitePhoto;
  button?: ButtonType;
  conversion_event_id?: string;
  additional_info?: string;
  show_userpic?: boolean;
  spent_budget?: number;
  remaining_budget?: number;
  daily_spent_budget?: number;
  daily_budget_limit?: number;
  views?: number;
  opens?: number;
  clicks?: number;
  actions?: number;
  action_type?: string;
  created_date?: number;
  is_paused?: boolean;
  activate_date?: number;
  deactivate_date?: number;
  schedule?: AdSchedule;
  status?: AdStatus;
  decline_reason?: DeclineReason;
}

export interface AdList {
  total_count: number;
  ads: Ad[];
  next_offset?: string;
}

export interface AdStatItem {
  from_time: number;
  to_time: number;
  views: number;
  opens: number;
  clicks: number;
  actions: number;
  currency: Currency;
  spent_budget: number;
}

export interface AccountReportItem {
  ad_id: number;
  ad_title?: string;
  ad_is_deleted?: boolean;
  views?: number;
  opens?: number;
  clicks?: number;
  actions?: number;
  currency?: Currency;
  spent_budget?: number;
}

export interface Audience {
  audience_id: number;
  title?: string;
  size: number;
  ads_count?: number;
  created_date?: number;
  updated_date?: number;
}

export interface AudiencesList {
  total_count: number;
  audiences: Audience[];
}

export interface Pixel {
  pixel_id: string;
  code_snippet?: string;
}

export interface PixelEvent {
  event_id: string;
  title?: string;
  type?: string;
  status?: string;
  ads_count?: number;
  created_date?: number;
  last_triggered_date?: number;
  auto_created?: boolean;
  code_snippet?: string;
}

export interface PixelEventsList {
  total_count: number;
  events: PixelEvent[];
}

export interface TargetLanguage {
  language_code: string;
  name?: string;
}

export interface TargetTopic {
  topic_id: number;
  name?: string;
}

export interface TargetCountry {
  country_code: string;
  name?: string;
}

export interface TargetLocation {
  location_id: number;
  name?: string;
  country_code?: string;
  region?: string;
}

export interface TargetLocationList {
  total_count: number;
  locations: TargetLocation[];
  next_offset?: string;
}

export interface TargetChannel {
  channel_id: number;
  title?: string;
  username?: string;
  photo_url?: string;
}

export interface TargetBot {
  bot_id: number;
  title?: string;
  username?: string;
  photo_url?: string;
}

export interface TransactionStatus {
  transaction_id: string;
  status: string;
  currency: Currency;
  amount: number;
  main_account?: Account;
  related_account?: Account;
  error?: string;
}

export interface AccountTransaction {
  peer: Record<string, unknown>;
  date: number;
  currency: Currency;
  amount: number;
}

export interface AccountTransactionsList {
  total_count: number;
  transactions: AccountTransaction[];
  next_offset?: string;
}

export interface AdTransaction {
  peer: Record<string, unknown>;
  date: number;
  currency: Currency;
  amount: number;
}

export interface AdTransactionsList {
  total_count: number;
  transactions: AdTransaction[];
  next_offset?: string;
}
