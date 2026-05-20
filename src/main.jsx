import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { ArrowDown, ArrowUp, Bell, Check, Edit3, Globe2, ImagePlus, Instagram, LogOut, Medal, MessageCircle, Plus, Search, Settings, Share2, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { hasSupabaseConfig, supabase } from "./supabase";
import {
  CONTINENT_COUNTRY_CODES,
  CONTINENT_ORDER,
  countryCodeFromFeature,
  countryFlag,
  countryNameFromFeature,
  getCountryName,
  normalizeCountryCode,
} from "./utils/countries";

const WORLD_GEOJSON_URL = "/countries-light.geojson";
const CANONICAL_APP_ORIGIN = "https://whereyoubeen.vercel.app";
const CANONICAL_APP_HOST = "whereyoubeen.vercel.app";
const GLOBAL_STATS_CACHE_KEY = "whereyoubeen-global-stats-v1";
const GLOBAL_STATS_CACHE_TTL = 10 * 60 * 1000;
const LEGACY_APP_HOSTS = new Set([
  "travel-map-five-kappa.vercel.app",
  "travel-map-donny-kims-projects.vercel.app",
  "travel-map-git-main-donny-kims-projects.vercel.app",
  "whereyoubeen-donny-kims-projects.vercel.app",
  "whereyoubeen-git-main-donny-kims-projects.vercel.app",
]);
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_SIZE = 5 * 1024 * 1024;
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
];
const BADGES = [
  { id: "countries-5", threshold: 5, name: "Visited 5 countries!" },
  { id: "countries-10", threshold: 10, name: "Visited 10 countries!" },
  { id: "countries-20", threshold: 20, name: "Visited 20 countries!" },
];
const TILE_LAYERS = {
  en: {
    url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
  ko: {
    url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
};

function shouldUseCanonicalHost(hostname) {
  return LEGACY_APP_HOSTS.has(hostname);
}

function canonicalizeCurrentLocation() {
  if (typeof window === "undefined") return;

  const { hostname, pathname, search, hash } = window.location;
  if (!shouldUseCanonicalHost(hostname)) return;

  window.location.replace(`${CANONICAL_APP_ORIGIN}${pathname}${search}${hash}`);
}

function getAuthRedirectUrl() {
  if (typeof window === "undefined") return CANONICAL_APP_ORIGIN;

  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return origin;
  if (hostname === CANONICAL_APP_HOST) return origin;
  return CANONICAL_APP_ORIGIN;
}

canonicalizeCurrentLocation();

const TEXT = {
  en: {
    activity: "Activity",
    addByUsername: "Add by username",
    addFriendPrompt: "Add a username to compare visits on the map.",
    addFriendTitle: "Add friend",
    added: "added",
    addSupabaseEnvVars: "Add Supabase env vars",
    admin: "Admin",
    adminPanel: "Admin Panel",
    adminStats: "Admin stats",
    adminUsers: "Users",
    africa: "Africa",
    antarctica: "Antarctica",
    asia: "Asia",
    collection: "Collection",
    collected: "Collected",
    close: "Close",
    community: "Community",
    communityBody: "Body",
    communityBodyPlaceholder: "Share a quick note for this country board.",
    communityComments: "{count} comments",
    communityDeletePost: "Delete",
    communityDeleteConfirm: "Delete this post?",
    communityEditPost: "Edit",
    communityEmpty: "No posts yet. Start the board.",
    communityImageTooLarge: "Community images must be 5MB or smaller.",
    communityImageSetupRequired:
      "Community image upload is not set up yet. In Supabase Storage, create a public bucket named exactly \"community-images\", then run supabase/migrations/008_community_replies_images.sql.",
    communityLoadError: "Could not load community posts.",
    communityOpen: "Open community",
    communityPost: "Post",
    communityReply: "Reply",
    communityReplyPlaceholder: "Write a reply...",
    communityRemoveImage: "Remove image",
    communitySavePost: "Save post",
    communitySaveReply: "Save reply",
    communitySetupRequired:
      "Database setup required: run the latest community migrations in Supabase SQL Editor, then refresh this page.",
    communityTitle: "Title",
    communityTitlePlaceholder: "What should travelers know?",
    continueWithGoogle: "Continue with Google",
    countryCollection: "Country Collection",
    countryDetailsPrompt: "Country details, your visit status, and friend visits will appear here.",
    countryVisited: "I visited this country",
    countryVisitPercent: "{percent}% of friends visited {country}",
    countryVisitPercentShort: "{percent}% of friends visited this country",
    countriesVisited: "countries visited",
    currentUsername: "Current username",
    europe: "Europe",
    friend: "Friend",
    friendActivityEmpty: "Friend activity will show up here.",
    friendClearSelection: "All friends",
    friendFallback: "A friend",
    friendMapTitle: "Travelers",
    friendRequestAccept: "Accept",
    friendRequestReject: "Reject",
    friendRequestSent: "Request sent",
    friendRequests: "Friend requests",
    friendSelected: "Selected friend",
    friendVisitNone: "Friends: none",
    friendVisits: "Friends",
    friends: "Friends",
    friendsVisitedCount: "{count} friends visited",
    friendsVisited: "Friends who visited",
    mostVisitedByFriends: "Most visited by friends",
    globalPercentile: "Global percentile",
    globalPercentileEmpty: "Not enough global data yet",
    globalPercentileTop: "You are in the top {percent}% of travelers",
    globalTotal: "Global total",
    go: "Go",
    guest: "Guest",
    instagram: "Instagram",
    language: "Language",
    leaderboard: "Leaderboard",
    loadingMap: "Loading world map",
    loginCopy: "Track visited countries, add friends, and compare journeys directly on the map.",
    mapFallback: "Preparing countries...",
    mine: "Mine",
    markAsVisited: "Mark as visited",
    northAmerica: "North America",
    notVisited: "Not visited",
    notSet: "Not set",
    oceania: "Oceania",
    profile: "Profile",
    profileLoading: "Profile loading",
    profileSettings: "Profile Settings",
    profileStillLoading: "Profile is still loading.",
    selectImageFile: "Please choose an image file.",
    saving: "Saving...",
    uploading: "Uploading...",
    recentFriendVisits: "Recent friend visits",
    refresh: "Refresh",
    saveChanges: "Save changes",
    searchCountry: "Search country",
    settings: "Settings",
    share: "Share",
    shareCopied: "Image copied",
    shareCopy: "Copy image",
    shareDownload: "Download image",
    shareGenerateError: "Could not generate the share image.",
    shareNative: "Share",
    shareSquare: "Square",
    shareStory: "Story",
    shareTitle: "Share my travel stats",
    shareUnsupported: "Copy is not supported in this browser. Download the image instead.",
    signOut: "Sign out",
    southAmerica: "South America",
    totalUsers: "Total users",
    totalVisitRecords: "Total visited country records",
    uploadAvatar: "Upload avatar",
    uploadImage: "Upload image",
    username: "Username",
    countryNotFound: "Country not found on the map.",
    databaseSetupRequired: "Database setup required: run the latest Supabase migrations, then refresh this page.",
    removeVisited: "Remove from visited",
    editNickname: "Edit nickname",
    nicknamePrompt: "Private nickname",
    nicknameSaved: "Nickname saved",
    friendNicknameSetupRequired:
      "Friend nicknames are not set up yet. Run supabase/migrations/013_friend_nicknames.sql in Supabase SQL Editor.",
    badges: "Badges",
    unlocked: "Unlocked",
    locked: "Locked",
    globalRarity: "{percent}% of users unlocked this",
    usernameSetupTitle: "Choose a username",
    usernameSetupCopy: "Friends will find you by this name.",
    usernameRules: "Use 3-20 lowercase letters, numbers, or underscores.",
    inappropriateName: "That name is not allowed. Please choose a respectful name.",
    saveUsername: "Save username",
    visited: "Visited",
    both: "Both",
    visitedVerb: "visited",
    worldSeen: "Mark the world you have seen.",
    yes: "YES",
    no: "NO",
    you: "You",
    youVisited: "You visited",
    noFriendsCountry: "No friends have marked this country yet.",
    noFriendData: "No friend data yet",
    noRecentActivity: "No recent activity",
    noTravelerFound: "No traveler found for that username.",
    ownUsername: "That is your own username.",
    alreadyFriends: "Already friends.",
    makeAdmin: "Make Admin",
    removeAdmin: "Remove Admin",
    confirmRemoveOwnAdmin: "Remove your own admin access?",
    validUsernameRequired: "Enter a valid username.",
    usernameTaken: "Username already taken",
    friendAdded: "{username} added.",
    avatarTooLarge: "Avatar image must be 2MB or smaller.",
    avatarUrlError: "Could not get avatar URL.",
    edited: "(edited)",
  },
  ko: {
    activity: "활동",
    addByUsername: "사용자명으로 추가",
    addFriendPrompt: "사용자명을 추가해 지도에서 여행 기록을 비교하세요.",
    addFriendTitle: "친구 추가",
    added: "명 추가됨",
    addSupabaseEnvVars: "Supabase 환경 변수 추가",
    admin: "관리자",
    adminPanel: "관리자 패널",
    adminStats: "관리자 통계",
    adminUsers: "사용자",
    africa: "아프리카",
    antarctica: "남극",
    asia: "아시아",
    collection: "컬렉션",
    collected: "수집 완료",
    close: "닫기",
    community: "커뮤니티",
    communityBody: "내용",
    communityBodyPlaceholder: "이 나라 게시판에 짧은 글을 남겨보세요.",
    communityComments: "댓글 {count}개",
    communityDeletePost: "삭제",
    communityDeleteConfirm: "이 게시글을 삭제할까요?",
    communityEditPost: "수정",
    communityEmpty: "아직 글이 없습니다. 첫 글을 올려보세요.",
    communityImageTooLarge: "커뮤니티 이미지는 5MB 이하여야 합니다.",
    communityImageSetupRequired:
      "커뮤니티 이미지 업로드 설정이 필요합니다. Supabase Storage에서 public bucket 이름을 정확히 \"community-images\"로 만들고 supabase/migrations/008_community_replies_images.sql을 실행해 주세요.",
    communityLoadError: "커뮤니티 글을 불러오지 못했습니다.",
    communityOpen: "커뮤니티 열기",
    communityPost: "게시",
    communityReply: "답글",
    communityReplyPlaceholder: "답글을 입력하세요...",
    communityRemoveImage: "이미지 제거",
    communitySavePost: "글 저장",
    communitySaveReply: "답글 저장",
    communitySetupRequired:
      "데이터베이스 설정이 필요합니다: Supabase SQL Editor에서 최신 community migration을 실행한 뒤 새로고침해 주세요.",
    communityTitle: "제목",
    communityTitlePlaceholder: "여행자들이 알면 좋은 내용은?",
    continueWithGoogle: "Google로 계속하기",
    countryCollection: "국가 컬렉션",
    countryDetailsPrompt: "국가 상세 정보, 방문 상태, 친구 방문 기록이 여기에 표시됩니다.",
    countryVisited: "이 나라를 방문했어요",
    countryVisitPercent: "친구 중 {percent}%가 {country}을/를 방문했습니다",
    countryVisitPercentShort: "친구 중 {percent}%가 이 나라를 방문했습니다",
    countriesVisited: "개국 방문",
    currentUsername: "현재 사용자명",
    europe: "유럽",
    friend: "친구",
    friendActivityEmpty: "친구 활동이 여기에 표시됩니다.",
    friendClearSelection: "전체 친구",
    friendFallback: "친구",
    friendMapTitle: "여행자",
    friendRequestAccept: "수락",
    friendRequestReject: "거절",
    friendRequestSent: "요청을 보냈습니다",
    friendRequests: "친구 요청",
    friendSelected: "선택한 친구",
    friendVisitNone: "친구: 없음",
    friendVisits: "친구",
    friends: "친구",
    friendsVisitedCount: "친구 {count}명이 방문",
    friendsVisited: "방문한 친구",
    mostVisitedByFriends: "친구들이 많이 방문한 나라",
    globalPercentile: "글로벌 상위 비율",
    globalPercentileEmpty: "아직 글로벌 데이터가 부족합니다",
    globalPercentileTop: "여행자 상위 {percent}%입니다",
    globalTotal: "전체 진행률",
    go: "이동",
    guest: "방문자",
    instagram: "인스타그램",
    language: "언어",
    leaderboard: "리더보드",
    loadingMap: "세계 지도 불러오는 중",
    loginCopy: "방문한 국가를 기록하고, 친구를 추가해 지도에서 여행을 비교하세요.",
    mapFallback: "국가 준비 중...",
    mine: "내 기록",
    markAsVisited: "방문으로 표시",
    northAmerica: "북아메리카",
    notVisited: "미방문",
    notSet: "미설정",
    oceania: "오세아니아",
    profile: "프로필",
    profileLoading: "프로필 불러오는 중",
    profileSettings: "프로필 설정",
    profileStillLoading: "프로필을 불러오는 중입니다.",
    selectImageFile: "이미지 파일을 선택해 주세요.",
    saving: "저장 중...",
    uploading: "업로드 중...",
    recentFriendVisits: "최근 친구 방문",
    refresh: "새로고침",
    saveChanges: "변경사항 저장",
    searchCountry: "국가 검색",
    settings: "설정",
    share: "공유",
    shareCopied: "이미지를 복사했습니다",
    shareCopy: "이미지 복사",
    shareDownload: "이미지 다운로드",
    shareGenerateError: "공유 이미지를 만들지 못했습니다.",
    shareNative: "공유",
    shareSquare: "정사각형",
    shareStory: "스토리",
    shareTitle: "내 여행 기록 공유",
    shareUnsupported: "이 브라우저에서는 복사를 지원하지 않습니다. 이미지를 다운로드해 주세요.",
    signOut: "로그아웃",
    southAmerica: "남아메리카",
    totalUsers: "전체 사용자",
    totalVisitRecords: "전체 국가 방문 기록",
    uploadAvatar: "아바타 업로드",
    uploadImage: "이미지 업로드",
    username: "사용자명",
    countryNotFound: "지도에서 해당 국가를 찾지 못했습니다.",
    databaseSetupRequired: "데이터베이스 설정이 필요합니다. 최신 Supabase migration을 실행한 뒤 새로고침해 주세요.",
    removeVisited: "방문 기록에서 제거",
    editNickname: "닉네임 수정",
    nicknamePrompt: "나만 볼 친구 닉네임",
    nicknameSaved: "닉네임을 저장했습니다",
    friendNicknameSetupRequired:
      "친구 닉네임 DB 설정이 아직 필요합니다. Supabase SQL Editor에서 supabase/migrations/013_friend_nicknames.sql을 실행해 주세요.",
    badges: "배지",
    unlocked: "해제됨",
    locked: "잠김",
    globalRarity: "사용자 {percent}%가 해제했습니다",
    usernameSetupTitle: "사용자명 만들기",
    usernameSetupCopy: "친구들이 이 이름으로 나를 찾을 수 있어요.",
    usernameRules: "3-20자의 소문자, 숫자, 밑줄만 사용할 수 있습니다.",
    inappropriateName: "사용할 수 없는 이름입니다. 다른 이름을 선택해 주세요.",
    saveUsername: "사용자명 저장",
    visited: "방문 완료",
    both: "공통",
    visitedVerb: "방문",
    worldSeen: "내가 본 세계를 기록하세요.",
    yes: "예",
    no: "아니요",
    you: "나",
    youVisited: "내 방문",
    noFriendsCountry: "아직 이 나라를 방문한 친구가 없습니다.",
    noFriendData: "아직 친구 데이터가 없습니다",
    noRecentActivity: "최근 활동이 없습니다",
    noTravelerFound: "해당 사용자명을 찾을 수 없습니다.",
    ownUsername: "내 사용자명은 추가할 수 없습니다.",
    alreadyFriends: "이미 친구입니다.",
    makeAdmin: "관리자로 지정",
    removeAdmin: "관리자 해제",
    confirmRemoveOwnAdmin: "본인의 관리자 권한을 해제할까요?",
    validUsernameRequired: "올바른 사용자명을 입력해 주세요.",
    usernameTaken: "이미 사용 중인 사용자명입니다",
    friendAdded: "{username}님을 추가했습니다.",
    avatarTooLarge: "아바타 이미지는 2MB 이하여야 합니다.",
    avatarUrlError: "아바타 URL을 가져오지 못했습니다.",
    edited: "(수정됨)",
  },
};
const SMALL_COUNTRY_HOTSPOTS = [
  { code: "HK", lat: 22.36, lng: 114.2 },
  { code: "MO", lat: 22.12, lng: 113.52 },
  { code: "IL", lat: 31.25, lng: 34.62 },
  { code: "PS", lat: 31.95, lng: 35.2 },
  { code: "IT", lat: 42.7, lng: 12.6 },
  { code: "GG", lat: 49.52, lng: -2.68 },
  { code: "JE", lat: 49.18, lng: -2.05 },
  { code: "QA", lat: 25.35, lng: 51.18 },
  { code: "MV", lat: 3.2028, lng: 73.2207 },
  { code: "SG", lat: 1.3521, lng: 103.8198 },
  { code: "MC", lat: 43.7384, lng: 7.4246 },
  { code: "MT", lat: 35.9375, lng: 14.3754 },
  { code: "VA", lat: 41.9029, lng: 12.4534 },
  { code: "SM", lat: 43.9424, lng: 12.4578 },
  { code: "LI", lat: 47.166, lng: 9.5554 },
  { code: "AD", lat: 42.5063, lng: 1.5218 },
  { code: "BH", lat: 26.0667, lng: 50.5577 },
  { code: "BN", lat: 4.5353, lng: 114.7277 },
  { code: "GU", lat: 13.45, lng: 144.75 },
  { code: "MP", lat: 15.25, lng: 145.75 },
  { code: "MU", lat: -20.3484, lng: 57.5522 },
  { code: "SC", lat: -4.6796, lng: 55.492 },
  { code: "BB", lat: 13.1939, lng: -59.5432 },
  { code: "AG", lat: 17.0608, lng: -61.7964 },
  { code: "GD", lat: 12.1165, lng: -61.679 },
  { code: "LC", lat: 13.9094, lng: -60.9789 },
  { code: "VC", lat: 12.9843, lng: -61.2872 },
  { code: "AW", lat: 12.5211, lng: -69.9683 },
  { code: "CW", lat: 12.1696, lng: -68.99 },
  { code: "AI", lat: 18.2206, lng: -63.0686 },
  { code: "BL", lat: 17.9, lng: -62.8333 },
  { code: "DM", lat: 15.415, lng: -61.371 },
  { code: "KN", lat: 17.3578, lng: -62.783 },
  { code: "KY", lat: 19.3133, lng: -81.2546 },
  { code: "MF", lat: 18.0708, lng: -63.0501 },
  { code: "MS", lat: 16.7425, lng: -62.1874 },
  { code: "PR", lat: 18.2208, lng: -66.5901 },
  { code: "SX", lat: 18.0425, lng: -63.0548 },
  { code: "TC", lat: 21.694, lng: -71.7979 },
  { code: "VG", lat: 18.4207, lng: -64.64 },
  { code: "VI", lat: 18.3358, lng: -64.8963 },
];
const SMALL_COUNTRY_CODES = new Set(SMALL_COUNTRY_HOTSPOTS.map((country) => country.code));
const OVERSEAS_TERRITORY_PARENTS = {
  AI: "GB",
  AW: "NL",
  BL: "FR",
  CW: "NL",
  GG: "GB",
  GU: "US",
  HK: "CN",
  JE: "GB",
  KY: "GB",
  MF: "FR",
  MO: "CN",
  MP: "US",
  MS: "GB",
  PR: "US",
  SX: "NL",
  TC: "GB",
  VG: "GB",
  VI: "US",
};
const COUNTRY_BUTTON_POSITION_OVERRIDES = {
  FI: [64.6, 26.2],
  GB: [54.6, -2.4],
  ID: [-7.35, 110.1],
  KG: [41.35, 74.65],
  MY: [4.2, 102.05],
  NO: [64.6, 11.8],
  VN: [16.1, 108.05],
  PH: [12.8, 122.2],
};
const EARLY_COUNTRY_BUTTON_MIN_ZOOM = {
  AE: 3,
  KP: 3,
  KR: 3,
};
const COUNTRY_BUTTON_SHORT_NAMES = {
  AE: "UAE",
  AG: "Antigua",
  BA: "Bosnia",
  BN: "Brunei",
  BO: "Bolivia",
  CF: "CAR",
  CD: "DR Congo",
  CG: "Congo",
  CI: "Cote d'Ivoire",
  CZ: "Czechia",
  DO: "Dominican Rep.",
  GB: "UK",
  GQ: "Eq. Guinea",
  HK: "Hong Kong",
  KN: "St. Kitts",
  KP: "N. Korea",
  KR: "S. Korea",
  LA: "Laos",
  LC: "St. Lucia",
  LI: "Liechtenstein",
  MC: "Monaco",
  MD: "Moldova",
  ME: "Montenegro",
  MK: "N. Macedonia",
  MO: "Macao",
  NL: "Netherlands",
  PS: "Palestine",
  SG: "Singapore",
  SM: "San Marino",
  ST: "Sao Tome",
  SZ: "Eswatini",
  TT: "Trinidad",
  TZ: "Tanzania",
  US: "USA",
  VA: "Vatican",
  VC: "St. Vincent",
  XK: "Kosovo",
};
const COMBINED_SMALL_COUNTRY_MARKERS = [
  {
    id: "HK_MO",
    codes: ["HK", "MO"],
    lat: 22.25,
    lng: 113.86,
    minZoom: 5,
    maxZoom: 6,
    label: "🇭🇰 Hong Kong / 🇲🇴 Macao",
    iconLabel: "🇭🇰🇲🇴",
  },
  {
    id: "KR_KP",
    codes: ["KR", "KP"],
    lat: 38.25,
    lng: 127.35,
    minZoom: 4,
    maxZoom: 5,
    label: "🇰🇷 South Korea / 🇰🇵 North Korea",
    iconLabel: "🇰🇷🇰🇵",
  },
  {
    id: "IL_PS",
    codes: ["IL", "PS"],
    lat: 31.63,
    lng: 34.92,
    minZoom: 5,
    maxZoom: 6,
    label: "🇮🇱 Israel / 🇵🇸 Palestine",
    iconLabel: "🇮🇱🇵🇸",
  },
  {
    id: "GG_JE",
    codes: ["GG", "JE"],
    lat: 49.35,
    lng: -2.36,
    minZoom: 5,
    maxZoom: 6,
    label: "🇬🇬 Guernsey / 🇯🇪 Jersey",
    iconLabel: "🇬🇬🇯🇪",
  },
  {
    id: "QA_BH",
    codes: ["QA", "BH"],
    lat: 25.72,
    lng: 50.86,
    minZoom: 5,
    maxZoom: 6,
    label: "🇶🇦 Qatar / 🇧🇭 Bahrain",
    iconLabel: "🇶🇦🇧🇭",
  },
  {
    id: "GU_MP",
    codes: ["GU", "MP"],
    lat: 14.36,
    lng: 145.22,
    minZoom: 5,
    maxZoom: 6,
    label: "🇬🇺 Guam / 🇲🇵 Saipan",
    iconLabel: "🇬🇺🇲🇵",
  },
  {
    id: "IT_VA_SM",
    codes: ["IT", "VA", "SM"],
    lat: 42.65,
    lng: 12.55,
    minZoom: 5,
    maxZoom: 6,
    label: "🇮🇹 Italy / 🇻🇦 Vatican City / 🇸🇲 San Marino",
    iconLabel: "🇮🇹🇻🇦🇸🇲",
  },
  {
    id: "SG_MY",
    codes: ["SG", "MY"],
    lat: 2.75,
    lng: 102.45,
    minZoom: 5,
    maxZoom: 6,
    label: "🇸🇬 Singapore / 🇲🇾 Malaysia",
    iconLabel: "🇸🇬🇲🇾",
  },
  {
    id: "CH_LI",
    codes: ["CH", "LI"],
    lat: 46.95,
    lng: 8.45,
    minZoom: 5,
    maxZoom: 6,
    label: "🇨🇭 Switzerland / 🇱🇮 Liechtenstein",
    iconLabel: "🇨🇭🇱🇮",
  },
  {
    id: "CARIBBEAN_CLUSTER",
    codes: ["PR", "VI", "VG", "TC", "KY", "MS", "AI", "SX", "BL", "MF", "AW", "CW", "AG", "BB", "GD", "LC", "VC", "DM", "KN"],
    lat: 16.2,
    lng: -67.1,
    minZoom: 5,
    maxZoom: 6,
    label: "Caribbean islands and territories",
    iconLabel: "Caribbean",
  },
  {
    id: "PR_VI_VG",
    codes: ["PR", "VI", "VG"],
    lat: 18.32,
    lng: -65.35,
    minZoom: 7,
    maxZoom: 8,
    label: "🇵🇷 Puerto Rico / 🇻🇮 U.S. Virgin Islands / 🇻🇬 British Virgin Islands",
    iconLabel: "🇵🇷🇻🇮🇻🇬",
  },
  {
    id: "KY_TC",
    codes: ["KY", "TC"],
    lat: 20.55,
    lng: -76.5,
    minZoom: 7,
    maxZoom: 8,
    label: "🇰🇾 Cayman Islands / 🇹🇨 Turks and Caicos Islands",
    iconLabel: "🇰🇾🇹🇨",
  },
  {
    id: "AI_MS",
    codes: ["AI", "MS"],
    lat: 17.45,
    lng: -62.65,
    minZoom: 7,
    maxZoom: 8,
    label: "🇦🇮 Anguilla / 🇲🇸 Montserrat",
    iconLabel: "🇦🇮🇲🇸",
  },
  {
    id: "SX_MF_BL",
    codes: ["SX", "MF", "BL"],
    lat: 18.0,
    lng: -62.95,
    minZoom: 7,
    maxZoom: 8,
    label: "🇸🇽 Sint Maarten / 🇲🇫 Saint Martin / 🇧🇱 Saint Barthélemy",
    iconLabel: "🇸🇽🇲🇫🇧🇱",
  },
  {
    id: "AW_CW",
    codes: ["AW", "CW"],
    lat: 12.34,
    lng: -69.48,
    minZoom: 7,
    maxZoom: 8,
    label: "🇦🇼 Aruba / 🇨🇼 Curaçao",
    iconLabel: "🇦🇼🇨🇼",
  },
  {
    id: "AG_KN",
    codes: ["AG", "KN"],
    lat: 17.2,
    lng: -62.25,
    minZoom: 7,
    maxZoom: 8,
    label: "🇦🇬 Antigua and Barbuda / 🇰🇳 Saint Kitts and Nevis",
    iconLabel: "🇦🇬🇰🇳",
  },
  {
    id: "DM_LC",
    codes: ["DM", "LC"],
    lat: 14.65,
    lng: -61.15,
    minZoom: 7,
    maxZoom: 8,
    label: "🇩🇲 Dominica / 🇱🇨 Saint Lucia",
    iconLabel: "🇩🇲🇱🇨",
  },
  {
    id: "BB_GD_VC",
    codes: ["BB", "GD", "VC"],
    lat: 12.75,
    lng: -60.8,
    minZoom: 7,
    maxZoom: 8,
    label: "🇧🇧 Barbados / 🇬🇩 Grenada / 🇻🇨 Saint Vincent and the Grenadines",
    iconLabel: "🇧🇧🇬🇩🇻🇨",
  },
];
const FEATURE_BOUNDS_CENTER_CACHE = new WeakMap();
const FEATURE_AREA_CACHE = new WeakMap();
const FEATURE_DISPLAY_CENTER_CACHE = new WeakMap();
const FEATURE_MIN_ZOOM_CACHE = new WeakMap();
const BLOCKED_NAME_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "dick",
  "pussy",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "slut",
  "whore",
  "sex",
  "porn",
  "porno",
  "xxx",
  "씨발",
  "시발",
  "ㅅㅂ",
  "병신",
  "ㅂㅅ",
  "지랄",
  "개새끼",
  "새끼",
  "좆",
  "존나",
  "보지",
  "자지",
  "섹스",
  "야동",
];

function FitWorld() {
  const map = useMap();

  useEffect(() => {
    map.setView([22, 8], 2);
  }, [map]);

  return null;
}

function ZoomObserver({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function makeFriendCode() {
  return `TRIP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function isValidUsername(value) {
  return /^[a-z0-9_]{3,20}$/.test(value);
}

function normalizeNameForSafety(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("0", "o")
    .replaceAll("1", "i")
    .replaceAll("3", "e")
    .replaceAll("4", "a")
    .replaceAll("5", "s")
    .replaceAll("7", "t")
    .replace(/[@$!|]/g, (char) => ({ "@": "a", "$": "s", "!": "i", "|": "i" })[char] || char)
    .replace(/[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

function isUnsafeName(value) {
  const normalized = normalizeNameForSafety(value);
  if (!normalized) return false;
  return BLOCKED_NAME_TERMS.some((term) => {
    const normalizedTerm = normalizeNameForSafety(term);
    return normalizedTerm && normalized.includes(normalizedTerm);
  });
}

function avatarLetter(username) {
  return (username || "?").trim().charAt(0).toUpperCase() || "?";
}

function getLanguage(profile) {
  return profile?.language === "ko" ? "ko" : DEFAULT_LANGUAGE;
}

function t(language, key) {
  return TEXT[language]?.[key] || TEXT.en[key] || key;
}

function formatText(language, key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    t(language, key),
  );
}

function isMissingCommunityPostsError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("community_posts") ||
    message.includes("community_replies") ||
    message.includes("community_votes") ||
    message.includes("image_url") ||
    message.includes("updated_at") ||
    message.includes("schema cache")
  );
}

function isMissingFriendNicknamesError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("friend_nicknames") || message.includes("schema cache");
}

function isMissingCommunityImageBucketError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("bucket not found") || error?.statusCode === "404" || error?.error === "Bucket not found";
}

function communityImagePathFromUrl(url) {
  const marker = "/storage/v1/object/public/community-images/";
  const index = String(url || "").indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(String(url).slice(index + marker.length).split("?")[0]);
}

function isEditedPost(post) {
  if (!post?.updated_at || !post?.created_at) return false;
  return new Date(post.updated_at).getTime() > new Date(post.created_at).getTime() + 1000;
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function readCachedGlobalStats() {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(GLOBAL_STATS_CACHE_KEY) || "null");
    if (!cached?.stats || Date.now() - cached.savedAt > GLOBAL_STATS_CACHE_TTL) return null;
    return cached.stats;
  } catch {
    return null;
  }
}

function writeCachedGlobalStats(stats) {
  if (typeof window === "undefined" || !stats) return;
  try {
    window.localStorage.setItem(
      GLOBAL_STATS_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), stats }),
    );
  } catch {
    // localStorage can be unavailable in private browsing modes.
  }
}

function getDisplayName(user, language = DEFAULT_LANGUAGE) {
  return user?.display_name || user?.friend_nickname || user?.username || t(language, "friendFallback");
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, "image/png", 0.95);
  });
}

function generateShareStatsImage({ aspect, username, visitedCount, topPercent, flags }) {
  const isStory = aspect === "story";
  const width = 1080;
  const height = isStory ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f8fafc");
  gradient.addColorStop(0.52, "#eef7ff");
  gradient.addColorStop(1, "#ecfdf5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const cardMargin = isStory ? 86 : 70;
  const cardX = cardMargin;
  const cardY = isStory ? 250 : 95;
  const cardW = width - cardMargin * 2;
  const cardH = isStory ? 1350 : 890;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 24;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 46);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 68px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(`🌍 I visited ${visitedCount} ${visitedCount === 1 ? "country" : "countries"}`, width / 2, cardY + 175);

  ctx.font = "700 38px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#0f766e";
  ctx.fillText(topPercent ? `Top ${topPercent}% traveler` : "Travel map collection", width / 2, cardY + 242);

  const visibleFlags = flags.slice(0, 20);
  const extraCount = Math.max(0, flags.length - visibleFlags.length);
  const columns = isStory ? 4 : 5;
  const chipW = isStory ? 152 : 138;
  const chipH = isStory ? 112 : 96;
  const gap = isStory ? 26 : 22;
  const rows = Math.ceil((visibleFlags.length + (extraCount ? 1 : 0)) / columns) || 1;
  const gridW = columns * chipW + (columns - 1) * gap;
  const gridX = (width - gridW) / 2;
  const gridY = cardY + (isStory ? 405 : 360);

  [...visibleFlags, ...(extraCount ? [`+${extraCount}`] : [])].forEach((flag, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = gridX + col * (chipW + gap);
    const y = gridY + row * (chipH + gap);

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    drawRoundedRect(ctx, x, y, chipW, chipH, 30);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = flag.startsWith("+") ? "#0f766e" : "#111827";
    ctx.font = flag.startsWith("+")
      ? "800 35px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      : "52px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
    ctx.fillText(flag, x + chipW / 2, y + chipH / 2 + (flag.startsWith("+") ? 12 : 18));
  });

  const footerY = cardY + cardH - 160;
  ctx.fillStyle = "#64748b";
  ctx.font = "700 34px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(`@${username || "traveler"}`, width / 2, footerY);

  ctx.fillStyle = "#0f172a";
  ctx.font = "900 38px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("whereyoubeen.vercel.app", width / 2, footerY + 70);

  return canvasToBlob(canvas);
}

function getCommunityRole({ countryCode, visitedSet }) {
  const boardCode = normalizeCountryCode(countryCode);
  if (visitedSet?.has?.(boardCode)) return "visited";
  return "guest";
}

function getRoleLabel(role, language) {
  if (role === "visited") return t(language, "visited");
  return t(language, "guest");
}

function formatTimestamp(value, language) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function Avatar({ user, size = "md" }) {
  const username = getDisplayName(user);

  return user?.avatar_url ? (
    <img className={`avatar avatar-${size}`} src={user.avatar_url} alt={`${username} avatar`} />
  ) : (
    <span className={`avatar avatar-${size} avatar-fallback`} aria-label={`${username} avatar`}>
      {avatarLetter(username)}
    </span>
  );
}

function getCountryButtonShortName(code, fallbackName = "") {
  const countryCode = normalizeCountryCode(code);
  const name = COUNTRY_BUTTON_SHORT_NAMES[countryCode] || fallbackName || getCountryName(countryCode, "en") || countryCode;
  return name.length > 15 ? `${name.slice(0, 14)}…` : name;
}

function getCountryButtonLabel(code, fallbackName = "") {
  return `${countryFlag(code)} ${getCountryButtonShortName(code, fallbackName)}`;
}

function getGroupedCountryButtonSize(groupCount, label = "") {
  if (groupCount >= 10) return { iconSize: [112, 54], iconAnchor: [56, 27] };
  if (groupCount >= 5) return { iconSize: [112, 76], iconAnchor: [56, 38] };
  if (groupCount === 4) return { iconSize: [146, 48], iconAnchor: [73, 24] };
  if (groupCount === 3) return { iconSize: [118, 48], iconAnchor: [59, 24] };
  if (groupCount === 2) return { iconSize: [86, 48], iconAnchor: [43, 24] };
  const labelLength = Array.from(label).length;
  const width = Math.min(148, Math.max(82, 30 + labelLength * 8));
  return { iconSize: [width, 48], iconAnchor: [width / 2, 24] };
}

function createCountryButtonIcon({ code, friendCount = 0, selected = false, label = "", groupCount = 1, groupCodes = null }) {
  const countBadge = friendCount ? `<span class="country-button-count">${friendCount}</span>` : "";
  const displayLabel = label || getCountryButtonLabel(code);
  const groupClass = groupCount > 1 ? `is-group-${Math.min(groupCount, 5)}` : "";
  const labelClass = groupCount === 1 ? "has-country-name" : "";
  const { iconSize, iconAnchor } = getGroupedCountryButtonSize(groupCount, displayLabel);
  const parentCode = groupCount === 1 ? OVERSEAS_TERRITORY_PARENTS[code] : "";
  const parentBadge = parentCode
    ? `<span class="country-owner-badge" title="${escapeHtml(getCountryName(parentCode, "en"))}">${countryFlag(parentCode)}</span>`
    : "";
  const innerHtml =
    groupCodes?.length >= 10
      ? `<span class="country-button-region-label">${escapeHtml(displayLabel)}</span>`
      : groupCodes?.length >= 5
      ? `<span class="country-button-cluster">${groupCodes
          .map((groupCode) => `<span>${countryFlag(groupCode)}</span>`)
          .join("")}</span>`
      : escapeHtml(displayLabel);
  return L.divIcon({
    className: `country-button-marker ${groupClass} ${labelClass} ${selected ? "is-selected" : ""}`,
    html: `<button class="country-map-button" type="button" aria-label="${escapeHtml(
      getCountryName(code, "en") || code,
    )}">${innerHtml}${parentBadge}${countBadge}</button>`,
    iconSize,
    iconAnchor,
  });
}

function getFeatureBoundsCenter(feature) {
  if (FEATURE_BOUNDS_CENTER_CACHE.has(feature)) return FEATURE_BOUNDS_CENTER_CACHE.get(feature);

  const points = [];
  const collect = (coords) => {
    if (typeof coords?.[0] === "number" && typeof coords?.[1] === "number") {
      points.push(coords);
      return;
    }
    coords?.forEach(collect);
  };

  collect(feature.geometry?.coordinates);
  if (!points.length) {
    FEATURE_BOUNDS_CENTER_CACHE.set(feature, null);
    return null;
  }

  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  const lng = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const lat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;

  const center = [lat, Math.max(-179.5, Math.min(179.5, lng))];
  FEATURE_BOUNDS_CENTER_CACHE.set(feature, center);
  return center;
}

function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function getFeatureArea(feature) {
  if (FEATURE_AREA_CACHE.has(feature)) return FEATURE_AREA_CACHE.get(feature);

  const geometry = feature?.geometry;
  const polygons =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  const area = polygons.reduce((sum, polygon) => sum + ringArea(polygon?.[0]), 0);
  FEATURE_AREA_CACHE.set(feature, area);
  return area;
}

function getCountryButtonMinZoom(feature) {
  if (FEATURE_MIN_ZOOM_CACHE.has(feature)) return FEATURE_MIN_ZOOM_CACHE.get(feature);

  const code = getIsoA2FromFeature(feature);
  if (EARLY_COUNTRY_BUTTON_MIN_ZOOM[code]) {
    FEATURE_MIN_ZOOM_CACHE.set(feature, EARLY_COUNTRY_BUTTON_MIN_ZOOM[code]);
    return EARLY_COUNTRY_BUTTON_MIN_ZOOM[code];
  }

  const area = getFeatureArea(feature);
  let minZoom = 5;
  if (area >= 280) minZoom = 2;
  else if (area >= 90) minZoom = 3;
  else if (area >= 20) minZoom = 4;
  FEATURE_MIN_ZOOM_CACHE.set(feature, minZoom);
  return minZoom;
}

function getWrappedLngDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function getMapPositionDistance(a, b) {
  if (!a || !b) return Infinity;
  const latDistance = Math.abs(a[0] - b[0]);
  const avgLatRadians = (((a[0] + b[0]) / 2) * Math.PI) / 180;
  const lngDistance = getWrappedLngDistance(a[1], b[1]) * Math.max(0.35, Math.cos(avgLatRadians));
  return Math.hypot(latDistance, lngDistance);
}

function getIsolatedCountryMinZoom(position, countries) {
  let nearestDistance = Infinity;

  countries.forEach((country) => {
    if (country.position === position) return;
    nearestDistance = Math.min(nearestDistance, getMapPositionDistance(position, country.position));
  });

  if (nearestDistance >= 24) return 2;
  if (nearestDistance >= 12) return 3;
  if (nearestDistance >= 7) return 4;
  return null;
}

function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let areaFactor = 0;
  let centroidLng = 0;
  let centroidLat = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const cross = current[0] * next[1] - next[0] * current[1];
    areaFactor += cross;
    centroidLng += (current[0] + next[0]) * cross;
    centroidLat += (current[1] + next[1]) * cross;
  }

  if (!areaFactor) return getFeatureBoundsCenter({ geometry: { coordinates: ring } });

  const lng = centroidLng / (3 * areaFactor);
  const lat = centroidLat / (3 * areaFactor);
  return [lat, Math.max(-179.5, Math.min(179.5, lng))];
}

function getFeatureDisplayCenter(feature) {
  const code = getIsoA2FromFeature(feature);
  if (COUNTRY_BUTTON_POSITION_OVERRIDES[code]) return COUNTRY_BUTTON_POSITION_OVERRIDES[code];
  if (FEATURE_DISPLAY_CENTER_CACHE.has(feature)) return FEATURE_DISPLAY_CENTER_CACHE.get(feature);

  const geometry = feature?.geometry;
  const polygons =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  let largestRing = null;
  let largestArea = 0;

  polygons.forEach((polygon) => {
    const outerRing = polygon?.[0];
    const area = ringArea(outerRing);
    if (area > largestArea) {
      largestArea = area;
      largestRing = outerRing;
    }
  });

  const center = ringCentroid(largestRing) || getFeatureBoundsCenter(feature);
  FEATURE_DISPLAY_CENTER_CACHE.set(feature, center);
  return center;
}

function getIsoA2FromFeature(feature) {
  const props = feature?.properties || {};
  const iso = props.ISO_A2 || props.iso_a2 || props["ISO3166-1-Alpha-2"];
  return /^[A-Z]{2}$/i.test(String(iso || "")) ? normalizeCountryCode(iso) : "";
}

function getCountryStyle(feature, context) {
  const code = getIsoA2FromFeature(feature);
  const selected = context.selectedCountryCode === code;
  const isUserVisited = context.visitedMine.has(code);
  const isFriendVisited = context.visitedFriend.has(code);
  const selectedFriendMode = Boolean(context.selectedFriendMode);

  const base = {
    lineCap: "round",
    lineJoin: "round",
    renderer: context.renderer,
  };

  if (isUserVisited && isFriendVisited) {
    return {
      ...base,
      color: "#b45309",
      weight: selected || selectedFriendMode ? 1.6 : 0.95,
      opacity: selected ? 0.62 : selectedFriendMode ? 0.5 : 0.36,
      fill: true,
      fillColor: "#f59e0b",
      fillOpacity: selected ? 0.34 : selectedFriendMode ? 0.32 : 0.3,
    };
  }

  if (isUserVisited) {
    return {
      ...base,
      color: "#0369a1",
      weight: selected ? 1.55 : 0.9,
      opacity: selected ? 0.58 : 0.34,
      fill: true,
      fillColor: "#38bdf8",
      fillOpacity: selected ? 0.28 : 0.24,
    };
  }

  if (isFriendVisited) {
    return {
      ...base,
      color: "#059669",
      weight: selected || selectedFriendMode ? 1.5 : 0.9,
      opacity: selected ? 0.6 : selectedFriendMode ? 0.5 : 0.34,
      fill: true,
      fillColor: "#6ee7b7",
      fillOpacity: selected ? 0.24 : selectedFriendMode ? 0.3 : 0.2,
    };
  }

  return {
    ...base,
    color: selected ? "#64748b" : "#94a3b8",
    weight: selected ? 1.25 : 0.7,
    opacity: selected ? 0.46 : 0.32,
    fill: true,
    fillColor: "#ffffff",
    fillOpacity: selected ? 0.08 : 0.02,
  };
}

function LoginScreen() {
  const language = DEFAULT_LANGUAGE;
  const handleGoogleLogin = async () => {
    if (!hasSupabaseConfig || !supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div>
          <img className="brand-logo brand-logo-login" src="/wyb-logo.png" alt="wyb" />
          <h1>{t(language, "worldSeen")}</h1>
          <p className="login-copy">{t(language, "loginCopy")}</p>
        </div>
        <button className="primary-action" onClick={handleGoogleLogin} disabled={!hasSupabaseConfig}>
          {hasSupabaseConfig ? t(language, "continueWithGoogle") : t(language, "addSupabaseEnvVars")}
        </button>
      </section>
    </main>
  );
}

function MapLegend({ language }) {
  return (
    <div className="legend" aria-label="Map legend">
      <span>
        <i className="swatch mine" /> {t(language, "mine")}
      </span>
      <span>
        <i className="swatch friend" /> {t(language, "friend")}
      </span>
      <span>
        <i className="swatch both" /> {t(language, "both")}
      </span>
    </div>
  );
}

function CountrySearch({ countries, language, onSelectCountry, onMissingCountry }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return countries.slice(0, 6);

    return countries
      .filter(
        (country) =>
          country.name.toLowerCase().includes(normalized) || country.code.toLowerCase() === normalized,
      )
      .slice(0, 6);
  }, [countries, query]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const selected = matches[0];
    if (!selected) {
      onMissingCountry?.();
      return;
    }
    onSelectCountry({ ...selected, focus: true, focusKey: Date.now() });
    setQuery("");
  };

  return (
    <form className="country-search" onSubmit={handleSubmit}>
      <Search size={16} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(language, "searchCountry")}
        aria-label={t(language, "searchCountry")}
        list="country-options"
      />
      <datalist id="country-options">
        {countries.map((country) => (
          <option key={country.code} value={country.name} />
        ))}
      </datalist>
      <button className="search-button">{t(language, "go")}</button>
    </form>
  );
}

function CountryButtonMarkers({ geojson, friendVisitMap, selectedCountryCode, zoom, onSelectCountry }) {
  const markers = useMemo(() => {
    const groupedCodesBeforeSplit = new Set(
      COMBINED_SMALL_COUNTRY_MARKERS
        .filter((marker) => zoom <= marker.maxZoom)
        .flatMap((marker) => marker.codes),
    );
    const largestFeatureByCode = new Map();

    (geojson?.features || []).forEach((feature) => {
      const code = getIsoA2FromFeature(feature);
      if (!code || SMALL_COUNTRY_CODES.has(code) || groupedCodesBeforeSplit.has(code)) return;

      const current = largestFeatureByCode.get(code);
      if (!current || getFeatureArea(feature) > getFeatureArea(current)) {
        largestFeatureByCode.set(code, feature);
      }
    });

    const countries = Array.from(largestFeatureByCode.values())
      .map((feature) => ({
        code: getIsoA2FromFeature(feature),
        feature,
        position: getFeatureDisplayCenter(feature),
      }))
      .filter((country) => country.code && country.position);

    return countries
      .map(({ code, feature, position }) => {
        const isolatedMinZoom = getIsolatedCountryMinZoom(position, countries);
        const minZoom = isolatedMinZoom
          ? Math.min(getCountryButtonMinZoom(feature), isolatedMinZoom)
          : getCountryButtonMinZoom(feature);
        if (zoom < minZoom) return null;

        const friends = friendVisitMap.get(code) || [];
        return {
          code,
          flag: countryFlag(code),
          name: getCountryName(code, "en") || countryNameFromFeature(feature),
          friendCount: friends.length,
          position,
        };
      })
      .filter(Boolean);
  }, [friendVisitMap, geojson, zoom]);

  return markers.map((marker) => {
    const label = `${marker.flag} ${marker.name}${marker.friendCount ? ` · ${marker.friendCount}` : ""}`;
    return (
      <Marker
        key={marker.code}
        position={marker.position}
        icon={createCountryButtonIcon({
          code: marker.code,
          friendCount: marker.friendCount,
          selected: selectedCountryCode === marker.code,
          label: getCountryButtonLabel(marker.code, marker.name),
        })}
        riseOnHover
        eventHandlers={{
          click: (event) => {
            const original = event.originalEvent || {};
            onSelectCountry({
              code: marker.code,
              flag: marker.flag,
              name: marker.name,
              x: original.clientX || 24,
              y: original.clientY || 160,
              showDetails: true,
            });
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -14]} opacity={0.95} interactive={false}>
          {label}
        </Tooltip>
      </Marker>
    );
  });
}

function SmallCountryHotspots({ friendVisitMap, selectedCountryCode, zoom, onSelectCountry }) {
  const map = useMap();

  if (zoom < 4) return null;

  const groupedCodesBeforeSplit = new Set(
    COMBINED_SMALL_COUNTRY_MARKERS
      .filter((marker) => zoom <= marker.maxZoom)
      .flatMap((marker) => marker.codes),
  );

  const combinedMarkers = COMBINED_SMALL_COUNTRY_MARKERS
    .filter((marker) => zoom >= marker.minZoom && zoom <= marker.maxZoom)
    .map((marker) => {
      const friends = marker.codes.flatMap((code) => friendVisitMap.get(code) || []);
      const uniqueFriendCount = new Set(friends.map((friend) => friend.id)).size;
      const selected = marker.codes.includes(selectedCountryCode);

      return (
        <Marker
          key={marker.id}
          position={[marker.lat, marker.lng]}
          icon={createCountryButtonIcon({
            code: marker.codes[0],
            friendCount: uniqueFriendCount,
            selected,
            label: marker.iconLabel,
            groupCount: marker.codes.length,
            groupCodes: marker.codes,
          })}
          riseOnHover
          eventHandlers={{
            click: () => {
              map.setView([marker.lat, marker.lng], marker.maxZoom + 1, { animate: true });
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -14]} opacity={0.95} interactive={false}>
            {marker.label}
          </Tooltip>
        </Marker>
      );
    });

  const individualMarkers = SMALL_COUNTRY_HOTSPOTS.filter((hotspot) => !groupedCodesBeforeSplit.has(hotspot.code)).map((hotspot) => {
    const code = normalizeCountryCode(hotspot.code);
    const friends = friendVisitMap.get(code) || [];
    const flag = countryFlag(code);
    const name = getCountryName(code, "en");
    const label = `${flag} ${name}${friends.length ? ` · ${friends.length}` : ""}`;

    return (
      <Marker
        key={code}
        position={[hotspot.lat, hotspot.lng]}
        icon={createCountryButtonIcon({
          code,
          friendCount: friends.length,
          selected: selectedCountryCode === code,
          label: getCountryButtonLabel(code, name),
        })}
        riseOnHover
        eventHandlers={{
          click: (event) => {
            const original = event.originalEvent || {};
            onSelectCountry({
              code,
              flag,
              name,
              x: original.clientX || 24,
              y: original.clientY || 160,
              showDetails: true,
            });
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -14]} opacity={0.95} interactive={false}>
          {label}
          {OVERSEAS_TERRITORY_PARENTS[code] ? ` · ${countryFlag(OVERSEAS_TERRITORY_PARENTS[code])} ${getCountryName(OVERSEAS_TERRITORY_PARENTS[code], "en")}` : ""}
        </Tooltip>
      </Marker>
    );
  });

  return [...combinedMarkers, ...individualMarkers];
}

function SelectedCountryFocus({ selectedCountry, geoJsonRef, onMissingCountry }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedCountry?.focus || !selectedCountry?.code) return;

    let targetLayer = null;
    geoJsonRef.current?.eachLayer((layer) => {
      if (countryCodeFromFeature(layer.feature) === selectedCountry.code) {
        targetLayer = layer;
      }
    });

    if (!targetLayer) {
      onMissingCountry?.();
      return;
    }

    const bounds = targetLayer.getBounds?.();
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    }
  }, [geoJsonRef, map, onMissingCountry, selectedCountry?.code, selectedCountry?.focus, selectedCountry?.focusKey]);

  return null;
}

function TravelMap({
  geojson,
  visits,
  friendVisitMap,
  selectedCountry,
  language,
  animatedCountryCode,
  onSelectCountry,
  onMarkVisited,
  onRemoveVisited,
  onMissingCountry,
  selectedFriend,
}) {
  const geoJsonRef = useRef(null);
  const [zoom, setZoom] = useState(2);
  const countryRenderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 4 }), []);

  const visitedMine = visits.mineSet;
  const visitedFriend = visits.friendSet;
  const tileLayer = TILE_LAYERS.en;

  const styleFeature = useCallback(
    (feature) =>
      getCountryStyle(feature, {
        selectedCountryCode: selectedCountry?.code,
        visitedMine,
        visitedFriend,
        renderer: countryRenderer,
        selectedFriendMode: Boolean(selectedFriend),
      }),
    [countryRenderer, selectedCountry?.code, selectedFriend, visitedFriend, visitedMine],
  );

  useEffect(() => {
    geoJsonRef.current?.eachLayer((layer) => {
      if (layer.feature) {
        layer.setStyle(styleFeature(layer.feature));
      }
    });
  }, [styleFeature]);

  useEffect(() => {
    if (!animatedCountryCode) return undefined;

    let targetLayer = null;
    geoJsonRef.current?.eachLayer((layer) => {
      if (countryCodeFromFeature(layer.feature) === animatedCountryCode) {
        targetLayer = layer;
      }
    });

    if (!targetLayer) return undefined;

    const targetStyle = styleFeature(targetLayer.feature);
    const start = performance.now();
    const duration = 900;
    let frame = 0;

    const animate = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const pulse = Math.sin(progress * Math.PI);

      targetLayer.setStyle({
        ...targetStyle,
        color: "#0ea5e9",
        weight: targetStyle.weight + pulse * 3.2,
        opacity: Math.min((targetStyle.opacity || 0.2) + pulse * 0.58, 0.95),
        fillOpacity: targetStyle.fillOpacity * eased,
      });

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        targetLayer.setStyle(targetStyle);
      }
    };

    targetLayer.setStyle({
      ...targetStyle,
      color: "#7dd3fc",
      weight: targetStyle.weight + 2.4,
      opacity: 0.88,
      fillOpacity: 0,
    });
    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [animatedCountryCode, styleFeature]);

  const onEachFeature = useCallback(
    (feature, layer) => {
      const code = countryCodeFromFeature(feature);
      const flag = countryFlag(code);

      layer.on({
        click: (event) => {
          const original = event.originalEvent || {};
          onSelectCountry({
            code,
            flag,
            x: original.clientX || 24,
            y: original.clientY || 160,
            showDetails: true,
          });
        },
        mouseover: (event) => {
          const style = styleFeature(feature);
          layer.setStyle({
            weight: style.weight + 0.35,
            opacity: Math.min((style.opacity || 0.2) + 0.18, 0.64),
            fill: true,
            fillColor: style.fillColor,
            fillOpacity: Math.min(style.fillOpacity + 0.08, 0.38),
          });
        },
        mouseout: () => {
          geoJsonRef.current?.resetStyle(layer);
        },
      });
    },
    [onSelectCountry, styleFeature],
  );

  const handleZoomChange = useCallback((nextZoom) => {
    setZoom(nextZoom);
  }, []);

  return (
    <MapContainer
      center={[22, 8]}
      zoom={2}
      minZoom={2}
      maxZoom={12}
      maxBounds={[
        [-85, -360000],
        [85, 360000],
      ]}
      maxBoundsViscosity={1}
      worldCopyJump
      className="map"
      zoomControl={false}
      preferCanvas
    >
      <FitWorld />
      <ZoomObserver onZoomChange={handleZoomChange} />
      <TileLayer
        key="terrain-map"
        attribution={tileLayer.attribution}
        url={tileLayer.url}
        subdomains={tileLayer.subdomains}
        noWrap={false}
      />
      <GeoJSON
        key={`${visitedMine.size}-${visitedFriend.size}-${selectedFriend?.id || "all"}`}
        ref={geoJsonRef}
        data={geojson}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
      <SelectedCountryFocus
        selectedCountry={selectedCountry}
        geoJsonRef={geoJsonRef}
        onMissingCountry={onMissingCountry}
      />
      <CountryButtonMarkers
        geojson={geojson}
        friendVisitMap={friendVisitMap}
        selectedCountryCode={selectedCountry?.code}
        zoom={zoom}
        onSelectCountry={onSelectCountry}
      />
      <SmallCountryHotspots
        friendVisitMap={friendVisitMap}
        selectedCountryCode={selectedCountry?.code}
        zoom={zoom}
        onSelectCountry={onSelectCountry}
      />
      <MapLegend language={language} />
    </MapContainer>
  );
}

function CountryDetailCard({
  country,
  mineSet,
  friendVisitMap,
  totalFriends,
  language,
  isSaving,
  onMarkVisited,
  onRemoveVisited,
  onClose,
}) {
  if (!country) return null;

  const code = normalizeCountryCode(country.code);
  const mine = mineSet.has(code);
  const friends = friendVisitMap.get(code) || [];
  const displayName = getCountryName(code, "en") || country.name || code;
  const friendPercent = totalFriends ? Math.round((friends.length / totalFriends) * 100) : null;
  const x = Math.min(Math.max((country.x || 28) + 16, 12), Math.max(12, window.innerWidth - 336));
  const y = Math.min(Math.max((country.y || 132) + 16, 12), Math.max(12, window.innerHeight - 330));

  return (
    <div
      className="country-detail-card"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={displayName}
    >
      <button className="country-detail-close" onClick={onClose} aria-label={t(language, "close")}>
        <X size={16} />
      </button>
      <div className="country-hover-heading">
        <h2>
          {country.flag || countryFlag(code)} {displayName}
        </h2>
        <p>{t(language, "youVisited")}: {mine ? t(language, "yes") : t(language, "no")}</p>
        <p>{formatText(language, "friendsVisitedCount", { count: friends.length })}</p>
        {friendPercent !== null ? (
          <p>{formatText(language, "countryVisitPercentShort", { percent: friendPercent })}</p>
        ) : (
          <p>{t(language, "noFriendData")}</p>
        )}
      </div>

      <div className="country-hover-actions">
        <button
          className={mine ? "secondary-action danger-action" : "primary-action"}
          onClick={() => (mine ? onRemoveVisited({ code, flag: country.flag }) : onMarkVisited({ code, flag: country.flag }))}
          disabled={isSaving}
        >
          <Check size={16} />
          {mine ? t(language, "removeVisited") : t(language, "countryVisited")}
        </button>
      </div>

      <div>
        <h3>{t(language, "friendsVisited")}</h3>
        {friends.length ? (
          <ul className="country-hover-friends">
            {friends.map((friend) => (
              <li key={friend.id}>
                <Avatar user={friend} size="sm" />
                <span>{getDisplayName(friend, language)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">{t(language, "noFriendsCountry")}</p>
        )}
      </div>
    </div>
  );
}

function FriendPanel({ friends, friendQuery, setFriendQuery, language, onAddFriend, isAdding }) {
  return (
    <aside className="side-panel">
      <div className="panel-heading">
        <h2>{t(language, "friends")}</h2>
        <p>
          {friends.length} {t(language, "added")}
        </p>
      </div>
      <form className="friend-form" onSubmit={onAddFriend}>
        <input
          value={friendQuery}
          onChange={(event) => setFriendQuery(event.target.value)}
          placeholder={t(language, "addByUsername")}
          aria-label={t(language, "addByUsername")}
        />
        <button className="icon-button solid" disabled={isAdding} title={t(language, "addFriendTitle")} aria-label={t(language, "addFriendTitle")}>
          <Plus size={18} />
        </button>
      </form>
      {friends.length ? (
        <ul className="simple-list friend-list">
          {friends.map((friend) => (
            <li key={friend.id}>
              <span className="friend-list-person">
                <Avatar user={friend} size="sm" />
                <span>{getDisplayName(friend, language)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">{t(language, "addFriendPrompt")}</p>
      )}
    </aside>
  );
}

function FriendRequestList({ requests, language, onAccept, onReject }) {
  if (!requests.length) {
    return <p className="empty-text">{t(language, "noRecentActivity")}</p>;
  }

  return (
    <div className="friend-request-list">
      <h3>{t(language, "friendRequests")}</h3>
      {requests.map((request) => {
        const sender = request.sender || {};
        return (
          <article className="friend-request-item" key={request.id}>
            <Avatar user={sender} size="sm" />
            <div>
              <strong>{sender.username || t(language, "friendFallback")}</strong>
              <span>{formatTimestamp(request.created_at, language)}</span>
            </div>
            <div className="friend-request-actions">
              <button className="secondary-action compact-action" onClick={() => onReject(request)}>
                {t(language, "friendRequestReject")}
              </button>
              <button className="primary-action compact-action" onClick={() => onAccept(request)}>
                {t(language, "friendRequestAccept")}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FriendMapRow({ profile, friends, selectedFriendId, language, onSelectFriend, onClearSelection }) {
  return (
    <div className="friend-map-row" aria-label={t(language, "friendMapTitle")}>
      <button
        className={`friend-story-chip ${selectedFriendId ? "" : "is-selected"}`}
        onClick={onClearSelection}
        title={t(language, "friendClearSelection")}
      >
        <span className="friend-story-all">
          <Globe2 size={18} />
        </span>
        <span>{t(language, "friendClearSelection")}</span>
      </button>
      {profile && (
        <button className="friend-story-chip" onClick={onClearSelection} title={t(language, "you")}>
          <Avatar user={profile} size="md" />
          <span>{t(language, "you")}</span>
        </button>
      )}
      {friends.map((friend) => (
        <button
          key={friend.id}
          className={`friend-story-chip ${selectedFriendId === friend.id ? "is-selected" : ""}`}
          onClick={() => onSelectFriend(friend.id)}
          title={getDisplayName(friend, language)}
        >
          <Avatar user={friend} size="md" />
          <span>{getDisplayName(friend, language)}</span>
        </button>
      ))}
    </div>
  );
}

function SelectedFriendPanel({ friend, visitCount, language, onClear }) {
  if (!friend) return null;
  return (
    <aside className="side-panel selected-friend-panel">
      <div className="selected-friend-card">
        <Avatar user={friend} size="md" />
        <div>
          <p className="eyebrow">{t(language, "friendSelected")}</p>
          <h2>{getDisplayName(friend, language)}</h2>
          <p>
            {visitCount} {t(language, "countriesVisited")}
          </p>
        </div>
      </div>
      <button className="secondary-action" onClick={onClear}>
        {t(language, "friendClearSelection")}
      </button>
    </aside>
  );
}

function ProfilePanel({ profile, language }) {
  return (
    <aside className="side-panel profile-card">
      <div className="panel-heading">
        <div className="profile-card-user">
          <Avatar user={profile || { username: "Profile" }} size="md" />
          <div>
            <h2>
              {t(language, "profile")} {profile?.is_admin && <span className="admin-badge">{t(language, "admin")}</span>}
            </h2>
            <p>{profile?.username || t(language, "profileLoading")}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function LeaderboardPanel({ leaderboard, language }) {
  return (
    <aside className="side-panel">
      <div className="panel-heading">
        <h2>{t(language, "leaderboard")}</h2>
        <p>{t(language, "countriesVisited")}</p>
      </div>
      {leaderboard.length ? (
        <ol className="leaderboard-list">
          {leaderboard.map((entry, index) => (
            <li key={entry.id}>
              <span className="leaderboard-rank">{index + 1}</span>
              <Avatar user={entry} size="sm" />
              <span className="leaderboard-name">{getDisplayName(entry, language)}</span>
              <span className="leaderboard-count">{entry.visitCount}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-text">{t(language, "addFriendPrompt")}</p>
      )}
    </aside>
  );
}

function MostVisitedByFriendsPanel({ entries, language }) {
  return (
    <aside className="side-panel">
      <div className="panel-heading">
        <h2>{t(language, "mostVisitedByFriends")}</h2>
        <p>{t(language, "friends")}</p>
      </div>
      {entries.length ? (
        <ol className="leaderboard-list">
          {entries.map((entry, index) => (
            <li key={entry.code}>
              <span className="leaderboard-rank">{index + 1}</span>
              <span className="country-rank-flag">{entry.flag}</span>
              <span className="leaderboard-name">{entry.name}</span>
              <span className="leaderboard-count">{entry.count}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-text">{t(language, "noFriendData")}</p>
      )}
    </aside>
  );
}

function UsernameSetupModal({ language, onSave }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const normalized = normalizeUsername(username);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!isValidUsername(normalized)) {
      setError(t(language, "usernameRules"));
      return;
    }
    if (isUnsafeName(normalized)) {
      setError(t(language, "inappropriateName"));
      return;
    }

    setIsSaving(true);
    const result = await onSave(normalized);
    if (result?.error) {
      setError(result.error);
    }
    setIsSaving(false);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="username-title">
      <form className="username-modal" onSubmit={handleSubmit}>
        <div>
          <img className="brand-logo brand-logo-small" src="/wyb-logo.png" alt="wyb" />
          <h2 id="username-title">{t(language, "usernameSetupTitle")}</h2>
          <p>{t(language, "usernameSetupCopy")}</p>
        </div>
        <input
          value={username}
          onChange={(event) => setUsername(normalizeUsername(event.target.value))}
          placeholder="username"
          aria-label="Username"
          autoFocus
        />
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={isSaving}>
          {t(language, "saveUsername")}
        </button>
      </form>
    </div>
  );
}

function ProfileSettingsModal({ profile, language, onClose, onSave, onUploadAvatar }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const normalized = normalizeUsername(username);
  const handleSave = async (event) => {
    event.preventDefault();
    setError("");

    if (!isValidUsername(normalized)) {
      setError(t(language, "usernameRules"));
      return;
    }
    if (isUnsafeName(normalized)) {
      setError(t(language, "inappropriateName"));
      return;
    }

    setIsSaving(true);
    const result = await onSave(normalized, selectedLanguage);
    setIsSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    onClose();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t(language, "selectImageFile"));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError(t(language, "avatarTooLarge"));
      return;
    }

    setIsUploading(true);
    const result = await onUploadAvatar(file);
    setIsUploading(false);

    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
      <form className="username-modal profile-modal" onSubmit={handleSave}>
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "settings")}</p>
            <h2 id="profile-settings-title">{t(language, "profileSettings")}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        <div className="avatar-upload-row">
          <Avatar user={profile} size="xl" />
          <div className="profile-summary">
            <span>{t(language, "currentUsername")}</span>
            <strong>{profile.username || t(language, "notSet")}</strong>
          </div>
          <label className="secondary-action">
            <ImagePlus size={17} />
            {isUploading ? t(language, "uploading") : t(language, "uploadAvatar")}
            <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={isUploading} />
          </label>
        </div>

        <label className="field-label">
          {t(language, "username")}
          <input
            value={username}
            onChange={(event) => setUsername(normalizeUsername(event.target.value))}
            placeholder="username"
            aria-label="Username"
          />
        </label>

        <label className="field-label">
          {t(language, "language")}
          <select
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value)}
            aria-label={t(language, "language")}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" disabled={isSaving || isUploading}>
          {isSaving ? t(language, "saving") : t(language, "saveChanges")}
        </button>
      </form>
    </div>
  );
}

function ActivityFeed({ activities, language, compact = false }) {
  return (
    <aside className={compact ? "activity-dropdown-panel" : "side-panel activity-feed"}>
      <div className="panel-heading">
        <h2>{t(language, "activity")}</h2>
        <p>{t(language, "recentFriendVisits")}</p>
      </div>
      {activities.length ? (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Avatar user={activity.profiles} size="sm" />
              <span>{getDisplayName(activity.profiles, language)}</span>
              <span>
                {t(language, "visitedVerb")} {countryFlag(activity.country_code)}{" "}
                {getCountryName(activity.country_code, language)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">{compact ? t(language, "noRecentActivity") : t(language, "friendActivityEmpty")}</p>
      )}
    </aside>
  );
}

function AccountMenu({ profile, language, isOpen, onToggle, onProfileSettings, onCountryCollection, onBadges, onLogout }) {
  return (
    <div className="account-menu-wrap">
      <button
        className="account-avatar-button"
        onClick={onToggle}
        title={t(language, "profile")}
        aria-label={t(language, "profile")}
        aria-expanded={isOpen}
      >
        <Avatar user={profile || { username: "Profile" }} size="md" />
      </button>
      {isOpen && (
        <div className="top-dropdown account-dropdown">
          <button onClick={onProfileSettings}>
            <Settings size={16} />
            {t(language, "profileSettings")}
          </button>
          <button onClick={onCountryCollection}>
            <Globe2 size={16} />
            {t(language, "countryCollection")}
          </button>
          <button onClick={onBadges}>
            <Medal size={16} />
            {t(language, "badges")}
          </button>
          <button className="danger-menu-item" onClick={onLogout}>
            <LogOut size={16} />
            {t(language, "signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationMenu({ activities, friendRequests, language, isOpen, hasUnread, onToggle, onAcceptRequest, onRejectRequest }) {
  const hasItems = activities.length > 0 || friendRequests.length > 0;
  return (
    <div className="account-menu-wrap">
      <button
        className="notification-button"
        onClick={onToggle}
        title={t(language, "activity")}
        aria-label={t(language, "activity")}
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {hasUnread && <span className="notification-dot" />}
      </button>
      {isOpen && (
        <div className="top-dropdown notification-dropdown">
          {friendRequests.length > 0 && (
            <FriendRequestList
              requests={friendRequests}
              language={language}
              onAccept={onAcceptRequest}
              onReject={onRejectRequest}
            />
          )}
          <ActivityFeed activities={activities} language={language} compact />
        </div>
      )}
    </div>
  );
}

function CountryCollectionModal({ countriesByContinent, mineSet, language, onClose }) {
  const totalVisited = CONTINENT_ORDER.reduce((sum, continent) => {
    return sum + countriesByContinent[continent].filter((country) => mineSet.has(country.code)).length;
  }, 0);
  const totalCountries = CONTINENT_ORDER.reduce((sum, continent) => {
    return sum + countriesByContinent[continent].length;
  }, 0);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="country-collection-title">
      <section className="collection-modal country-collection-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "collection")}</p>
            <h2 id="country-collection-title">{t(language, "countryCollection")}</h2>
            <p>
              {totalVisited} / {totalCountries} {t(language, "countriesVisited")}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        <div className="continent-list">
          {CONTINENT_ORDER.map((continent) => {
            const countriesForContinent = countriesByContinent[continent];
            const visited = countriesForContinent.filter((country) => mineSet.has(country.code)).length;
            const total = countriesForContinent.length;

            return (
              <section className="continent-section" key={continent}>
                <div className="continent-heading">
                  <div>
                    <h3>{t(language, continent)}</h3>
                    <p>
                      {visited}/{total} {t(language, "countriesVisited")} - {percent(visited, total)}%
                    </p>
                  </div>
                </div>
                <div className="country-chip-grid">
                  {countriesForContinent.map((country) => {
                    const visitedCountry = mineSet.has(country.code);
                    return (
                      <span className={`country-chip ${visitedCountry ? "is-visited" : ""}`} key={country.code}>
                        {country.flag} {country.name}
                      </span>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RoleBadge({ role, language }) {
  return <span className={`role-badge role-${role}`}>{getRoleLabel(role, language)}</span>;
}

function CommunityModal({
  countries,
  selectedCountry,
  posts,
  repliesByPost,
  voteSummaryByPost,
  currentUserId,
  visitPercent,
  isLoading,
  isPosting,
  replyingPostId,
  language,
  mineSet,
  authorVisitedMap,
  onSelectCountry,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
  onCreateReply,
  onUpdateReply,
  onDeleteReply,
  onVote,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [error, setError] = useState("");
  const [selectedPostId, setSelectedPostId] = useState("");

  const boardCountry = selectedCountry || countries[0];
  const boardCode = normalizeCountryCode(boardCountry?.code);
  const myRole = getCommunityRole({ countryCode: boardCode, visitedSet: mineSet });
  const selectedPost = posts.find((post) => post.id === selectedPostId) || null;

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return countries.slice(0, 8);
    return countries
      .filter(
        (country) =>
          country.name.toLowerCase().includes(normalized) || country.code.toLowerCase() === normalized,
      )
      .slice(0, 8);
  }, [countries, query]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const handleCountrySubmit = (event) => {
    event.preventDefault();
    const typed = query.trim().toLowerCase();
    const nextCountry =
      matches[0] ||
      countries.find((country) => country.name.toLowerCase() === typed) ||
      countries.find((country) => country.code.toLowerCase() === typed);
    if (nextCountry) {
      onSelectCountry(nextCountry);
      setQuery("");
    }
  };

  const handlePostSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setError(t(language, "communityTitlePlaceholder"));
      return;
    }

    const result = await onCreatePost({ countryCode: boardCode, title: cleanTitle, body: cleanBody, imageFile });
    if (result?.error) {
      setError(result.error);
      return;
    }

    setTitle("");
    setBody("");
    setImageFile(null);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="community-title">
      <section className="collection-modal community-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "community")}</p>
            <h2 id="community-title">
              {countryFlag(boardCode)} {getCountryName(boardCode, language)}
            </h2>
            <RoleBadge role={myRole} language={language} />
            <p className="community-board-stat">
              {visitPercent?.hasData
                ? formatText(language, "countryVisitPercent", {
                    percent: visitPercent.percent,
                    country: getCountryName(boardCode, language),
                  })
                : t(language, "noFriendData")}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        <form className="community-search" onSubmit={handleCountrySubmit}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(language, "searchCountry")}
            aria-label={t(language, "searchCountry")}
            list="community-country-options"
          />
          <datalist id="community-country-options">
            {countries.map((country) => (
              <option key={country.code} value={country.name} />
            ))}
          </datalist>
          <button className="search-button">{t(language, "go")}</button>
        </form>

        <div className="community-country-strip">
          {matches.map((country) => (
            <button
              type="button"
              className={`country-chip ${country.code === boardCode ? "is-visited" : ""}`}
              key={country.code}
              onClick={() => onSelectCountry(country)}
            >
              {country.flag} {country.name}
            </button>
          ))}
        </div>

        <form className="community-compose" onSubmit={handlePostSubmit}>
          <label className="field-label">
            {t(language, "communityTitle")}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t(language, "communityTitlePlaceholder")}
              maxLength={120}
            />
          </label>
          <label className="field-label">
            {t(language, "communityBody")}
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t(language, "communityBodyPlaceholder")}
              rows={4}
              maxLength={2000}
            />
          </label>
          <label className="secondary-action community-image-upload">
            <ImagePlus size={17} />
            {t(language, "uploadImage")}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                setError("");
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  setError(t(language, "selectImageFile"));
                  return;
                }
                if (file.size > MAX_COMMUNITY_IMAGE_SIZE) {
                  setError(t(language, "communityImageTooLarge"));
                  return;
                }
                setImageFile(file);
              }}
            />
          </label>
          {imagePreview && (
            <div className="community-image-preview">
              <img src={imagePreview} alt="" />
              <button type="button" className="icon-button" onClick={() => setImageFile(null)} aria-label={t(language, "close")}>
                <X size={16} />
              </button>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" disabled={isPosting || !boardCode}>
            {isPosting ? t(language, "saving") : t(language, "communityPost")}
          </button>
        </form>

        <div className="community-post-list">
          {isLoading ? (
            <p className="empty-text">{t(language, "loadingMap")}</p>
          ) : posts.length ? (
            posts.map((post) => {
              const author = post.profiles || {};
              const authorVisits = authorVisitedMap.get(post.user_id) || new Set();
              const role = getCommunityRole({
                countryCode: boardCode,
                visitedSet: authorVisits,
              });
              return (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  author={author}
                  role={role}
                  replyCount={(repliesByPost.get(post.id) || []).length}
                  voteSummary={voteSummaryByPost.get(post.id) || { score: 0, myVote: "" }}
                  currentUserId={currentUserId}
                  language={language}
                  onUpdatePost={onUpdatePost}
                  onDeletePost={onDeletePost}
                  onVote={onVote}
                  onOpenComments={() => setSelectedPostId(post.id)}
                />
              );
            })
          ) : (
            <p className="empty-text">{t(language, "communityEmpty")}</p>
          )}
        </div>

        {selectedPost && (
          <PostDetailModal
            post={selectedPost}
            author={selectedPost.profiles || {}}
            role={getCommunityRole({
              countryCode: boardCode,
              visitedSet: authorVisitedMap.get(selectedPost.user_id) || new Set(),
            })}
            voteSummary={voteSummaryByPost.get(selectedPost.id) || { score: 0, myVote: "" }}
            replies={repliesByPost.get(selectedPost.id) || []}
            currentUserId={currentUserId}
            language={language}
            isSavingReply={replyingPostId === selectedPost.id}
            onUpdatePost={onUpdatePost}
            onDeletePost={onDeletePost}
            onVote={onVote}
            onCreateReply={onCreateReply}
            onUpdateReply={onUpdateReply}
            onDeleteReply={onDeleteReply}
            onClose={() => setSelectedPostId("")}
          />
        )}
      </section>
    </div>
  );
}

function CommunityPostCard({
  post,
  author,
  role,
  voteSummary,
  currentUserId,
  language,
  onUpdatePost,
  onDeletePost,
  onVote,
  replyCount,
  onOpenComments,
  hideCommentButton = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(post.title || "");
  const [body, setBody] = useState(post.body || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = Boolean(currentUserId && post.user_id === currentUserId);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!isEditing) {
      setTitle(post.title || "");
      setBody(post.body || "");
      setImageFile(null);
      setRemoveImage(false);
      setError("");
    }
  }, [isEditing, post.body, post.title]);

  const handleSave = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    setError("");

    if (!cleanTitle || !cleanBody) {
      setError(t(language, "communityTitlePlaceholder"));
      return;
    }

    setIsSaving(true);
    const result = await onUpdatePost(post, { title: cleanTitle, body: cleanBody, imageFile, removeImage });
    setIsSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(t(language, "communityDeleteConfirm"))) return;
    const result = await onDeletePost(post);
    if (result?.error) {
      setError(result.error);
    }
  };

  const editImageSrc = imagePreview || (!removeImage ? post.image_url : "");

  return (
    <article className="community-post">
      <div className="community-post-layout">
        <div className="vote-column" aria-label="Post votes">
          <button
            className={`vote-button ${voteSummary.myVote === "up" ? "is-selected" : ""}`}
            onClick={() => onVote(post.id, "up")}
            aria-label="Upvote"
          >
            <ArrowUp size={17} />
          </button>
          <strong>{voteSummary.score}</strong>
          <button
            className={`vote-button ${voteSummary.myVote === "down" ? "is-selected" : ""}`}
            onClick={() => onVote(post.id, "down")}
            aria-label="Downvote"
          >
            <ArrowDown size={17} />
          </button>
        </div>

        <div className="community-post-main">
          <div className="community-post-meta">
            <Avatar user={author} size="sm" />
            <strong>{author.username || t(language, "friendFallback")}</strong>
            {author.is_admin && <span className="admin-badge compact-badge">{t(language, "admin")}</span>}
            <RoleBadge role={role} language={language} />
            <span>{formatTimestamp(post.created_at, language)}</span>
            {isEditedPost(post) && <span>{t(language, "edited")}</span>}
            {canEdit && (
              <span className="post-owner-actions">
                <button className="post-edit-button" onClick={() => setIsEditing((current) => !current)}>
                  <Edit3 size={14} />
                  {t(language, "communityEditPost")}
                </button>
                <button className="post-edit-button danger" onClick={handleDelete}>
                  {t(language, "communityDeletePost")}
                </button>
              </span>
            )}
          </div>

          {isEditing ? (
            <form className="post-edit-form" onSubmit={handleSave}>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={2000} />
              <label className="secondary-action community-image-upload">
                <ImagePlus size={17} />
                {t(language, "uploadImage")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    setError("");
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      setError(t(language, "selectImageFile"));
                      return;
                    }
                    if (file.size > MAX_COMMUNITY_IMAGE_SIZE) {
                      setError(t(language, "communityImageTooLarge"));
                      return;
                    }
                    setRemoveImage(false);
                    setImageFile(file);
                  }}
                />
              </label>
              {editImageSrc && (
                <div className="community-image-preview">
                  <img src={editImageSrc} alt="" />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => {
                      setImageFile(null);
                      setRemoveImage(true);
                    }}
                    aria-label={t(language, "communityRemoveImage")}
                    title={t(language, "communityRemoveImage")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
              <div className="post-edit-actions">
                <button className="primary-action" disabled={isSaving}>
                  {isSaving ? t(language, "saving") : t(language, "communitySavePost")}
                </button>
                <button type="button" className="secondary-action" onClick={() => setIsEditing(false)}>
                  {t(language, "close")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3>{post.title}</h3>
              <p>{post.body}</p>
              {post.image_url && <img className="community-post-image" src={post.image_url} alt="" />}
            </>
          )}

          {!isEditing && !hideCommentButton && (
            <button className="comment-toggle-button" onClick={onOpenComments}>
              <MessageCircle size={16} />
              {formatText(language, "communityComments", { count: replyCount || 0 })}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PostDetailModal({
  post,
  author,
  role,
  voteSummary,
  replies,
  currentUserId,
  language,
  isSavingReply,
  onUpdatePost,
  onDeletePost,
  onVote,
  onCreateReply,
  onUpdateReply,
  onDeleteReply,
  onClose,
}) {
  return (
    <div className="post-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="post-detail-title">
      <section className="post-detail-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "community")}</p>
            <h2 id="post-detail-title">{post.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>
        <CommunityPostCard
          post={post}
          author={author}
          role={role}
          replyCount={replies.length}
          voteSummary={voteSummary}
          currentUserId={currentUserId}
          language={language}
          onUpdatePost={onUpdatePost}
          onDeletePost={onDeletePost}
          onVote={onVote}
          onOpenComments={() => {}}
          hideCommentButton
        />
        <ReplyList
          post={post}
          replies={replies}
          currentUserId={currentUserId}
          language={language}
          isSaving={isSavingReply}
          onCreateReply={onCreateReply}
          onUpdateReply={onUpdateReply}
          onDeleteReply={onDeleteReply}
        />
      </section>
    </div>
  );
}

function ReplyList({ post, replies, currentUserId, language, isSaving, onCreateReply, onUpdateReply, onDeleteReply }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanBody = body.trim();
    setError("");
    if (!cleanBody) return;

    const result = await onCreateReply(post.id, cleanBody);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setBody("");
  };

  return (
    <div className="reply-block">
      {replies.length > 0 && (
        <ul className="reply-list">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              currentUserId={currentUserId}
              language={language}
              onUpdateReply={onUpdateReply}
              onDeleteReply={onDeleteReply}
            />
          ))}
        </ul>
      )}
      <form className="reply-form" onSubmit={handleSubmit}>
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t(language, "communityReplyPlaceholder")}
          maxLength={800}
        />
        <button className="secondary-action" disabled={isSaving || !body.trim()}>
          {isSaving ? t(language, "saving") : t(language, "communityReply")}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function ReplyItem({ reply, currentUserId, language, onUpdateReply, onDeleteReply }) {
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(reply.body || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = Boolean(currentUserId && reply.user_id === currentUserId);

  useEffect(() => {
    if (!isEditing) {
      setBody(reply.body || "");
      setError("");
    }
  }, [isEditing, reply.body]);

  const handleSave = async (event) => {
    event.preventDefault();
    const cleanBody = body.trim();
    setError("");
    if (!cleanBody) return;

    setIsSaving(true);
    const result = await onUpdateReply(reply, cleanBody);
    setIsSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(t(language, "communityDeleteConfirm"))) return;
    const result = await onDeleteReply(reply);
    if (result?.error) setError(result.error);
  };

  return (
    <li>
      <Avatar user={reply.profiles} size="sm" />
      <div>
        <div className="reply-meta">
          <strong>{reply.profiles?.username || t(language, "friendFallback")}</strong>
          {reply.profiles?.is_admin && <span className="admin-badge compact-badge">{t(language, "admin")}</span>}
          <span>{formatTimestamp(reply.created_at, language)}</span>
          {isEditedPost(reply) && <span>{t(language, "edited")}</span>}
          {canEdit && (
            <span className="reply-actions">
              <button className="post-edit-button" onClick={() => setIsEditing((current) => !current)}>
                {t(language, "communityEditPost")}
              </button>
              <button className="post-edit-button danger" onClick={handleDelete}>
                {t(language, "communityDeletePost")}
              </button>
            </span>
          )}
        </div>
        {isEditing ? (
          <form className="reply-edit-form" onSubmit={handleSave}>
            <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={800} />
            <button className="secondary-action" disabled={isSaving || !body.trim()}>
              {isSaving ? t(language, "saving") : t(language, "communitySaveReply")}
            </button>
          </form>
        ) : (
          <p>{reply.body}</p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </li>
  );
}

function GlobalPercentilePanel({ stats, language }) {
  return (
    <aside className="side-panel">
      <div className="panel-heading">
        <h2>{t(language, "globalPercentile")}</h2>
      </div>
      <p className="empty-text">
        {stats?.hasEnoughUsers
          ? formatText(language, "globalPercentileTop", { percent: stats.topPercent })
          : t(language, "globalPercentileEmpty")}
      </p>
    </aside>
  );
}

function BadgesPanel({ visitCount, stats, language, compact = false }) {
  return (
    <aside className={compact ? "badges-panel badges-panel-compact" : "side-panel badges-panel"}>
      <div className="panel-heading">
        <h2>{t(language, "badges")}</h2>
        <p>{visitCount}</p>
      </div>
      <div className="badge-grid">
        {BADGES.map((badge) => {
          const unlocked = visitCount >= badge.threshold;
          const rarity = stats?.badgeRarities?.[badge.id];

          return (
            <article className={`badge-card ${unlocked ? "is-unlocked" : ""}`} key={badge.id}>
              <Medal size={18} />
              <div>
                <h3>{badge.name}</h3>
                <p>{unlocked ? t(language, "unlocked") : t(language, "locked")}</p>
                <p>
                  {rarity === null || rarity === undefined
                    ? t(language, "globalPercentileEmpty")
                    : formatText(language, "globalRarity", { percent: rarity })}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function ShareStatsModal({ profile, visitedCountries, visitCount, stats, language, onClose, onNotice }) {
  const [aspect, setAspect] = useState("story");
  const [imageUrl, setImageUrl] = useState("");
  const [imageBlob, setImageBlob] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let revoked = false;
    let nextUrl = "";

    const buildImage = async () => {
      setIsGenerating(true);
      setError("");
      setImageBlob(null);
      setImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });

      try {
        const blob = await generateShareStatsImage({
          aspect,
          username: profile?.username,
          visitedCount: visitCount,
          topPercent: stats?.hasEnoughUsers ? stats.topPercent : null,
          flags: visitedCountries.map((country) => country.flag).filter(Boolean),
        });

        if (revoked) return;
        nextUrl = URL.createObjectURL(blob);
        setImageBlob(blob);
        setImageUrl(nextUrl);
      } catch {
        if (!revoked) setError(t(language, "shareGenerateError"));
      } finally {
        if (!revoked) setIsGenerating(false);
      }
    };

    buildImage();

    return () => {
      revoked = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [aspect, language, profile?.username, stats?.hasEnoughUsers, stats?.topPercent, visitCount, visitedCountries]);

  const filename = `whereyoubeen-${profile?.username || "traveler"}-${aspect}.png`;

  const downloadImage = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = filename;
    link.click();
  };

  const copyImage = async () => {
    if (!imageBlob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
      onNotice(t(language, "shareUnsupported"));
      return;
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imageBlob })]);
      onNotice(t(language, "shareCopied"));
    } catch {
      onNotice(t(language, "shareUnsupported"));
    }
  };

  const nativeShare = async () => {
    if (!imageBlob || !navigator.share) return;

    const file = new File([imageBlob], filename, { type: "image/png" });
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "whereyoubeen", text: `I visited ${visitCount} countries` });
        return;
      }
      await navigator.share({
        title: "whereyoubeen",
        text: `I visited ${visitCount} countries`,
        files: [file],
      });
    } catch {
      // User cancelled native share.
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <section className="collection-modal share-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "share")}</p>
            <h2 id="share-modal-title">{t(language, "shareTitle")}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        <div className="share-aspect-toggle" role="group" aria-label={t(language, "shareTitle")}>
          <button type="button" className={aspect === "story" ? "active" : ""} onClick={() => setAspect("story")}>
            {t(language, "shareStory")} 9:16
          </button>
          <button type="button" className={aspect === "square" ? "active" : ""} onClick={() => setAspect("square")}>
            {t(language, "shareSquare")} 1:1
          </button>
        </div>

        <div className={`share-preview ${aspect === "square" ? "share-preview-square" : ""}`}>
          {imageUrl ? <img src={imageUrl} alt={t(language, "shareTitle")} /> : <p>{isGenerating ? t(language, "loadingMap") : t(language, "shareGenerateError")}</p>}
        </div>
        {error && <p className="form-error">{error}</p>}

        <div className="share-actions">
          <button type="button" className="secondary-button" onClick={downloadImage} disabled={!imageUrl || isGenerating}>
            {t(language, "shareDownload")}
          </button>
          <button type="button" className="secondary-button" onClick={copyImage} disabled={!imageBlob || isGenerating}>
            {t(language, "shareCopy")}
          </button>
          <button type="button" onClick={nativeShare} disabled={!imageBlob || isGenerating || !navigator.share}>
            {t(language, "shareNative")}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminStatsPanel({ stats, language }) {
  if (!stats) return null;

  return (
    <aside className="side-panel admin-panel">
      <div className="panel-heading">
        <h2>{t(language, "adminStats")}</h2>
        <p>{t(language, "admin")}</p>
      </div>
      <div className="stat-grid">
        <span>{t(language, "totalUsers")}</span>
        <strong>{stats.totalUsers ?? "-"}</strong>
        <span>{t(language, "totalVisitRecords")}</span>
        <strong>{stats.totalVisitRecords ?? "-"}</strong>
      </div>
    </aside>
  );
}

function AdminManagementModal({ users, currentUserId, language, isLoading, onToggleAdmin, onClose }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const selectedUser = users.find((user) => user.id === selectedUserId) || users[0] || null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
      <section className="collection-modal admin-management-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">{t(language, "admin")}</p>
            <h2 id="admin-panel-title">{t(language, "adminPanel")}</h2>
            <p>{t(language, "adminUsers")}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <p className="empty-text">{t(language, "loadingMap")}</p>
        ) : (
          <div className="admin-user-list">
            {users.map((user) => (
              <article
                className={`admin-user-row ${selectedUser?.id === user.id ? "is-selected" : ""}`}
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
              >
                <Avatar user={user} size="sm" />
                <div>
                  <strong>
                    {user.username || t(language, "friendFallback")}{" "}
                    {user.is_admin && <span className="admin-badge compact-badge">{t(language, "admin")}</span>}
                  </strong>
                </div>
                <span className="admin-visit-count">
                  {user.visitCount} {t(language, "countriesVisited")}
                </span>
                <button
                  className={user.is_admin ? "secondary-action danger-action compact-action" : "primary-action compact-action"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleAdmin(user);
                  }}
                >
                  {user.is_admin ? t(language, "removeAdmin") : t(language, "makeAdmin")}
                </button>
                {user.id === currentUserId && <span className="empty-text">{t(language, "you")}</span>}
              </article>
            ))}
          </div>
        )}
        {selectedUser && (
          <section className="admin-user-detail">
            <div className="profile-card-user">
              <Avatar user={selectedUser} size="md" />
              <div>
                <h3>{selectedUser.username || t(language, "friendFallback")}</h3>
                <p>
                  {selectedUser.visitCount} {t(language, "countriesVisited")}
                </p>
              </div>
            </div>
            <div className="country-chip-grid admin-country-grid">
              {(selectedUser.visitedCodes || []).length ? (
                selectedUser.visitedCodes.map((code) => (
                  <span className="country-chip is-visited" key={code}>
                    {countryFlag(code)} {getCountryName(code, language)}
                  </span>
                ))
              ) : (
                <p className="empty-text">{t(language, "notVisited")}</p>
              )}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [geojsonError, setGeojsonError] = useState("");
  const [mineVisits, setMineVisits] = useState([]);
  const [friendVisits, setFriendVisits] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [activities, setActivities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCountryCollectionOpen, setIsCountryCollectionOpen] = useState(false);
  const [isBadgesOpen, setIsBadgesOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [readNotificationKey, setReadNotificationKey] = useState(() => {
    try {
      return window.localStorage.getItem("travel-map-read-notifications") || "";
    } catch {
      return "";
    }
  });
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityCountry, setCommunityCountry] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityReplies, setCommunityReplies] = useState([]);
  const [communityVotes, setCommunityVotes] = useState([]);
  const [communityAuthorVisits, setCommunityAuthorVisits] = useState(new Map());
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isPostingCommunity, setIsPostingCommunity] = useState(false);
  const [replyingPostId, setReplyingPostId] = useState("");
  const [globalStats, setGlobalStats] = useState(() => readCachedGlobalStats());
  const [adminUsers, setAdminUsers] = useState([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [animatedCountryCode, setAnimatedCountryCode] = useState("");

  const language = getLanguage(profile);

  const countryNames = useMemo(() => {
    const map = new Map();
    geojson?.features?.forEach((feature) => {
      const code = countryCodeFromFeature(feature);
      map.set(code, getCountryName(code, language) || countryNameFromFeature(feature));
    });
    return map;
  }, [geojson, language]);

  const countryOptions = useMemo(() => {
    return (geojson?.features || [])
      .map((feature) => {
        const code = countryCodeFromFeature(feature);
        return {
          code,
          name: getCountryName(code, language) || countryNameFromFeature(feature),
          flag: countryFlag(code),
        };
      })
      .filter((country) => /^[A-Z]{2}$/.test(country.code))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geojson, language]);

  const countriesByContinent = useMemo(() => {
    const byCode = new Map(countryOptions.map((country) => [country.code, country]));
    return Object.fromEntries(
      CONTINENT_ORDER.map((continent) => [
        continent,
        CONTINENT_COUNTRY_CODES[continent]
          .map((code) => byCode.get(code) || { code, name: getCountryName(code, language), flag: countryFlag(code) })
          .sort((a, b) => a.name.localeCompare(b.name)),
      ]),
    );
  }, [countryOptions, language]);

  const defaultCommunityCountry = useMemo(() => {
    return (
      countryOptions.find((country) => country.code === selectedCountry?.code) ||
      countryOptions[0] ||
      null
    );
  }, [countryOptions, selectedCountry?.code]);

  const selectedFriend = useMemo(
    () => friends.find((friend) => friend.id === selectedFriendId) || null,
    [friends, selectedFriendId],
  );

  const selectedFriendVisitSet = useMemo(() => {
    if (!selectedFriendId) return new Set();
    const codes = new Set(
      friendVisits
        .filter((visit) => visit.user_id === selectedFriendId)
        .map((visit) => normalizeCountryCode(visit.country_code))
        .filter(Boolean),
    );
    return codes;
  }, [friendVisits, selectedFriendId]);

  const visitState = useMemo(() => {
    const mineSet = new Set(
      mineVisits
        .map((visit) => normalizeCountryCode(visit.country_code))
        .filter(Boolean),
    );
    const friendSet = selectedFriendId
      ? selectedFriendVisitSet
      : new Set(friendVisits.map((visit) => normalizeCountryCode(visit.country_code)).filter(Boolean));
    return { mineSet, friendSet };
  }, [friendVisits, mineVisits, selectedFriendId, selectedFriendVisitSet]);

  const displayedVisitCount = visitState.mineSet.size;

  const visitedCountries = useMemo(() => {
    const byCode = new Map(countryOptions.map((country) => [country.code, country]));
    return Array.from(visitState.mineSet)
      .map((code) => byCode.get(code) || { code, name: getCountryName(code, "en"), flag: countryFlag(code) })
      .filter((country) => /^[A-Z]{2}$/.test(country.code))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countryOptions, visitState.mineSet]);

  const friendVisitMap = useMemo(() => {
    const friendById = new Map(friends.map((friend) => [friend.id, friend]));
    const map = new Map();
    friendVisits.forEach((visit) => {
      const code = normalizeCountryCode(visit.country_code);
      const friend = friendById.get(visit.user_id);
      if (!friend) return;
      const current = map.get(code) || [];
      if (!current.some((item) => item.id === friend.id)) {
        current.push(friend);
      }
      map.set(code, current);
    });
    return map;
  }, [friendVisits, friends]);

  const mostVisitedByFriends = useMemo(() => {
    return Array.from(friendVisitMap.entries())
      .map(([code, visitors]) => ({
        code,
        count: visitors.length,
        name: getCountryName(code, language),
        flag: countryFlag(code),
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [friendVisitMap, language]);

  const notificationKey = useMemo(() => {
    const activityKey = activities.map((activity) => activity.id).join(",");
    const requestKey = friendRequests.map((request) => request.id).join(",");
    return `${activityKey}|${requestKey}`;
  }, [activities, friendRequests]);

  const hasNotificationItems = activities.length > 0 || friendRequests.length > 0;
  const hasUnreadNotifications = Boolean(hasNotificationItems && notificationKey !== readNotificationKey);

  const communityFriendVisitPercent = useMemo(() => {
    const code = normalizeCountryCode((communityCountry || defaultCommunityCountry)?.code);
    const visitors = friendVisitMap.get(code) || [];
    return {
      hasData: friends.length > 0,
      totalFriends: friends.length,
      visitedFriends: visitors.length,
      percent: friends.length ? Math.round((visitors.length / friends.length) * 100) : 0,
    };
  }, [communityCountry, defaultCommunityCountry, friendVisitMap, friends.length]);

  const leaderboard = useMemo(() => {
    const entries = [];

    if (profile) {
      entries.push({
        ...profile,
        username: profile.username || "You",
        visitCount: displayedVisitCount,
      });
    }

    friends.forEach((friend) => {
      const friendCodes = new Set(
        friendVisits
          .filter((visit) => visit.user_id === friend.id)
          .map((visit) => normalizeCountryCode(visit.country_code)),
      );
      entries.push({
        ...friend,
        username: friend.username || "Friend",
        display_name: getDisplayName(friend, language),
        visitCount: friendCodes.size,
      });
    });

    return entries.sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return getDisplayName(a, language).localeCompare(getDisplayName(b, language));
    });
  }, [displayedVisitCount, friendVisits, friends, language, profile]);

  const communityRepliesByPost = useMemo(() => {
    const map = new Map();
    communityReplies.forEach((reply) => {
      const current = map.get(reply.post_id) || [];
      current.push(reply);
      map.set(reply.post_id, current);
    });
    return map;
  }, [communityReplies]);

  const communityVoteSummaryByPost = useMemo(() => {
    const userId = session?.user?.id;
    const map = new Map();
    communityVotes.forEach((vote) => {
      const current = map.get(vote.post_id) || { score: 0, myVote: "" };
      current.score += vote.vote_type === "up" ? 1 : -1;
      if (vote.user_id === userId) current.myVote = vote.vote_type;
      map.set(vote.post_id, current);
    });
    return map;
  }, [communityVotes, session?.user?.id]);

  const hydrateProfile = useCallback(async (activeSession) => {
    if (!supabase || !activeSession?.user) {
      setProfile(null);
      return null;
    }

    const user = activeSession.user;
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      setProfile(existingProfile);
      return existingProfile;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = {
        id: user.id,
        username: null,
        friend_code: makeFriendCode(),
      };
      const { data, error } = await supabase.from("profiles").insert(candidate).select("*").single();
      if (!error && data) {
        setProfile(data);
        return data;
      }
    }

    setNotice("Could not create your profile. Check Supabase policies and try again.");
    return null;
  }, []);

  const loadMapData = useCallback(async () => {
    try {
      const response = await fetch(WORLD_GEOJSON_URL);
      if (!response.ok) throw new Error("Missing countries.geojson");
      const data = await response.json();
      setGeojson(data);
      setGeojsonError("");
    } catch {
      setGeojsonError("Add public/countries.geojson to render the world map.");
    }
  }, []);

  const refreshSocialData = useCallback(async () => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return;

    const [
      { data: myData },
      { data: friendRows },
      { data: nicknameRows, error: nicknameError },
      { data: requestRows, error: requestError },
    ] = await Promise.all([
      supabase.from("visited_countries").select("*").eq("user_id", userId),
      supabase
        .from("friends")
        .select("friend_id, friend:profiles!friends_friend_id_fkey(id, username, avatar_url, is_admin)")
        .eq("user_id", userId),
      supabase.from("friend_nicknames").select("friend_id, nickname").eq("user_id", userId),
      supabase
        .from("friend_requests")
        .select("*, sender:profiles!friend_requests_sender_id_fkey(id, username, avatar_url, is_admin), receiver:profiles!friend_requests_receiver_id_fkey(id, username, avatar_url, is_admin)")
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    const nicknameByFriendId = new Map(
      (nicknameError ? [] : nicknameRows || []).map((row) => [row.friend_id, row.nickname || ""]),
    );
    const friendProfiles = (friendRows || [])
      .map((row) => row.friend)
      .filter(Boolean)
      .map((friend) => {
        const nickname = nicknameByFriendId.get(friend.id) || "";
        return {
          ...friend,
          friend_nickname: nickname,
          display_name: nickname || friend.username,
        };
      });
    const friendIds = friendProfiles.map((friend) => friend.id);

    setMineVisits(myData || []);
    setFriends(friendProfiles);
    setFriendRequests(requestError ? [] : requestRows || []);

    if (!friendIds.length) {
      setFriendVisits([]);
      setActivities([]);
      return;
    }

    const [{ data: friendVisitData }, { data: activityData }] = await Promise.all([
      supabase.from("visited_countries").select("*").in("user_id", friendIds),
      supabase
        .from("activities")
        .select("id, user_id, country_code, created_at, profiles!activities_user_id_fkey(username, avatar_url)")
        .in("user_id", friendIds)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setFriendVisits(friendVisitData || []);
    const friendById = new Map(friendProfiles.map((friend) => [friend.id, friend]));
    setActivities(
      (activityData || []).map((activity) => {
        const friend = friendById.get(activity.user_id);
        return {
          ...activity,
          profiles: friend ? { ...(activity.profiles || {}), ...friend } : activity.profiles,
          country_name: countryNames.get(normalizeCountryCode(activity.country_code)) || activity.country_code,
        };
      }),
    );
  }, [countryNames, session?.user?.id]);

  const refreshGlobalStats = useCallback(async ({ force = false } = {}) => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return;

    const cachedStats = readCachedGlobalStats();
    if (!force && cachedStats) {
      setGlobalStats(cachedStats);
      return;
    }

    const [{ data: profileRows }, { count: totalVisitRecords }, { data: visitRows }] = await Promise.all([
      supabase.from("profiles").select("id"),
      supabase.from("visited_countries").select("id", { count: "exact", head: true }),
      supabase.from("visited_countries").select("user_id, country_code"),
    ]);

    const userVisitCounts = new Map();
    (profileRows || []).forEach((profileRow) => {
      userVisitCounts.set(profileRow.id, new Set());
    });
    (visitRows || []).forEach((visit) => {
      const code = normalizeCountryCode(visit.country_code);
      const current = userVisitCounts.get(visit.user_id) || new Set();
      current.add(code);
      userVisitCounts.set(visit.user_id, current);
    });

    const allCounts = Array.from(userVisitCounts.values()).map((codes) => codes.size);
    const myCount = userVisitCounts.get(userId)?.size || 0;
    const usersWithVisits = allCounts.length;
    const usersWithFewerVisits = allCounts.filter((count) => count < myCount).length;
    const percentile = usersWithVisits ? Math.round((usersWithFewerVisits / usersWithVisits) * 100) : 0;
    const topPercent = Math.max(1, 100 - percentile);
    const totalUserCount = profileRows?.length || 0;
    const badgeRarities = Object.fromEntries(
      BADGES.map((badge) => {
        const unlockedCount = Array.from(userVisitCounts.values()).filter(
          (codes) => codes.size >= badge.threshold,
        ).length;
        return [badge.id, totalUserCount >= 3 ? Math.round((unlockedCount / totalUserCount) * 100) : null];
      }),
    );

    const nextStats = {
      hasEnoughUsers: usersWithVisits >= 3,
      percentile,
      topPercent,
      totalUsers: totalUserCount,
      totalVisitRecords: totalVisitRecords || 0,
      badgeRarities,
    };

    setGlobalStats(nextStats);
    writeCachedGlobalStats(nextStats);
  }, [session?.user?.id]);

  useEffect(() => {
    loadMapData();

    if (!supabase) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      hydrateProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      hydrateProfile(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [hydrateProfile, loadMapData]);

  useEffect(() => {
    refreshSocialData();
  }, [refreshSocialData]);

  useEffect(() => {
    if (selectedFriendId && !friends.some((friend) => friend.id === selectedFriendId)) {
      setSelectedFriendId("");
    }
  }, [friends, selectedFriendId]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    const run = () => refreshGlobalStats();
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 3500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(run, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [refreshGlobalStats, session?.user?.id]);

  const handleMarkVisited = useCallback(
    async (country) => {
      const userId = session?.user?.id;
      if (
        !supabase ||
        !userId ||
        !country?.code ||
        visitState.mineSet.has(country.code)
      ) {
        return;
      }

      setIsSavingVisit(true);
      setAnimatedCountryCode(country.code);
      setMineVisits((current) => [
        ...current,
        {
          id: `optimistic-${country.code}`,
          user_id: userId,
          country_code: country.code,
          created_at: new Date().toISOString(),
        },
      ]);
      setSelectedCountry(country);

      const { error } = await supabase.from("visited_countries").insert({
        user_id: userId,
        country_code: country.code,
      });

      if (error && error.code !== "23505") {
        setNotice(error.message);
        setAnimatedCountryCode("");
        setMineVisits((current) => current.filter((visit) => visit.id !== `optimistic-${country.code}`));
        setIsSavingVisit(false);
        return;
      }

      await supabase.from("activities").insert({
        user_id: userId,
        country_code: country.code,
      });

      setIsSavingVisit(false);
      window.setTimeout(() => setAnimatedCountryCode(""), 720);
      refreshSocialData();
    },
    [refreshSocialData, session?.user?.id, visitState.mineSet],
  );

  const handleRemoveVisited = useCallback(
    async (country) => {
      const userId = session?.user?.id;
      if (!supabase || !userId || !country?.code || !visitState.mineSet.has(country.code)) return;

      const removedVisits = mineVisits.filter((visit) => normalizeCountryCode(visit.country_code) === country.code);
      setIsSavingVisit(true);
      setMineVisits((current) => current.filter((visit) => normalizeCountryCode(visit.country_code) !== country.code));
      setSelectedCountry(country);

      const { error } = await supabase
        .from("visited_countries")
        .delete()
        .eq("user_id", userId)
        .eq("country_code", country.code);

      if (error) {
        setNotice(error.message);
        setMineVisits((current) => [...current, ...removedVisits]);
      }

      setIsSavingVisit(false);
      refreshSocialData();
    },
    [mineVisits, refreshSocialData, session?.user?.id, visitState.mineSet],
  );

  const handleAddFriend = async (event) => {
    event.preventDefault();
    const username = normalizeUsername(friendQuery);
    const userId = session?.user?.id;
    if (!supabase || !username || !userId) return;

    if (!isValidUsername(username)) {
      setNotice(t(language, "validUsernameRequired"));
      return;
    }

    setIsAddingFriend(true);
    const { data: friend, error: findError } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (findError || !friend) {
      setNotice(t(language, "noTravelerFound"));
      setIsAddingFriend(false);
      return;
    }

    if (friend.id === userId) {
      setNotice(t(language, "ownUsername"));
      setIsAddingFriend(false);
      return;
    }

    if (friends.some((currentFriend) => currentFriend.id === friend.id)) {
      setNotice(t(language, "alreadyFriends"));
      setIsAddingFriend(false);
      return;
    }

    const { data: existingRequests } = await supabase
      .from("friend_requests")
      .select("id, status")
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${userId})`)
      .in("status", ["pending", "accepted"])
      .limit(1);
    const existingRequest = existingRequests?.[0];

    if (existingRequest?.status === "accepted") {
      setNotice(t(language, "alreadyFriends"));
      setIsAddingFriend(false);
      return;
    }

    if (existingRequest?.status === "pending") {
      setNotice(t(language, "friendRequestSent"));
      setFriendQuery("");
      setIsAddingFriend(false);
      return;
    }

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: userId,
      receiver_id: friend.id,
      status: "pending",
    });

    if (error && error.code !== "23505") {
      setNotice(error.message);
    } else {
      setFriendQuery("");
      setNotice(t(language, "friendRequestSent"));
      refreshSocialData();
    }

    setIsAddingFriend(false);
  };

  const handleAcceptFriendRequest = async (request) => {
    const userId = session?.user?.id;
    if (!supabase || !userId || request?.receiver_id !== userId) return;

    const { error: updateError } = await supabase
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", userId);

    if (updateError) {
      setNotice(updateError.message);
      return;
    }

    const { error: friendError } = await supabase.from("friends").upsert(
      [
        { user_id: request.sender_id, friend_id: request.receiver_id },
        { user_id: request.receiver_id, friend_id: request.sender_id },
      ],
      { onConflict: "user_id,friend_id" },
    );

    if (friendError) {
      setNotice(friendError.message);
      return;
    }

    setFriendRequests((current) => current.filter((item) => item.id !== request.id));
    refreshSocialData();
  };

  const handleRejectFriendRequest = async (request) => {
    const userId = session?.user?.id;
    if (!supabase || !userId || request?.receiver_id !== userId) return;

    const { error } = await supabase
      .from("friend_requests")
      .update({ status: "rejected" })
      .eq("id", request.id)
      .eq("receiver_id", userId);

    if (error) {
      setNotice(error.message);
      return;
    }

    setFriendRequests((current) => current.filter((item) => item.id !== request.id));
  };

  const handleSaveFriendNickname = async (friend) => {
    const userId = session?.user?.id;
    if (!supabase || !userId || !friend?.id) return;

    const currentNickname = friend.friend_nickname || "";
    const nextNickname = window.prompt(t(language, "nicknamePrompt"), currentNickname);
    if (nextNickname === null) return;

    const cleanNickname = nextNickname.trim().slice(0, 30);
    if (cleanNickname && isUnsafeName(cleanNickname)) {
      setNotice(t(language, "inappropriateName"));
      return;
    }
    const previousFriends = friends;
    const applyNickname = (items) =>
      items.map((item) =>
        item.id === friend.id
          ? {
              ...item,
              friend_nickname: cleanNickname,
              display_name: cleanNickname || item.username,
            }
          : item,
      );

    setFriends(applyNickname);

    const result = cleanNickname
      ? await supabase
          .from("friend_nicknames")
          .upsert(
            { user_id: userId, friend_id: friend.id, nickname: cleanNickname },
            { onConflict: "user_id,friend_id" },
          )
      : await supabase.from("friend_nicknames").delete().eq("user_id", userId).eq("friend_id", friend.id);

    if (result.error) {
      setFriends(previousFriends);
      setNotice(isMissingFriendNicknamesError(result.error) ? t(language, "friendNicknameSetupRequired") : result.error.message);
      return;
    }

    setActivities((current) =>
      current.map((activity) =>
        activity.user_id === friend.id
          ? {
              ...activity,
              profiles: {
                ...(activity.profiles || {}),
                friend_nickname: cleanNickname,
                display_name: cleanNickname || activity.profiles?.username,
              },
            }
          : activity,
      ),
    );
    setNotice(t(language, "nicknameSaved"));
  };

  const loadAdminUsers = useCallback(async () => {
    if (!supabase || !profile?.is_admin) return;
    setIsLoadingAdminUsers(true);
    const [{ data: userRows, error: userError }, { data: visitRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_url, is_admin")
        .order("username", { ascending: true }),
      supabase.from("visited_countries").select("user_id, country_code"),
    ]);

    if (userError) {
      setNotice(userError.message);
      setIsLoadingAdminUsers(false);
      return;
    }

    const visitCounts = new Map();
    (visitRows || []).forEach((visit) => {
      const current = visitCounts.get(visit.user_id) || new Set();
      current.add(normalizeCountryCode(visit.country_code));
      visitCounts.set(visit.user_id, current);
    });

    setAdminUsers(
      (userRows || []).map((user) => ({
        ...user,
        visitedCodes: Array.from(visitCounts.get(user.id) || new Set()).sort(),
        visitCount: (visitCounts.get(user.id) || new Set()).size,
      })),
    );
    setIsLoadingAdminUsers(false);
  }, [profile?.is_admin]);

  const handleToggleAdmin = async (user) => {
    const userId = session?.user?.id;
    if (!supabase || !profile?.is_admin || !user?.id || !userId) return;
    if (user.id === userId && user.is_admin && !window.confirm(t(language, "confirmRemoveOwnAdmin"))) {
      return;
    }

    const nextIsAdmin = !user.is_admin;
    setAdminUsers((current) =>
      current.map((item) => (item.id === user.id ? { ...item, is_admin: nextIsAdmin } : item)),
    );

    const { error } = await supabase.from("profiles").update({ is_admin: nextIsAdmin }).eq("id", user.id);
    if (error) {
      setNotice(error.message);
      setAdminUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, is_admin: user.is_admin } : item)),
      );
      return;
    }

    if (user.id === userId) {
      setProfile((current) => ({ ...(current || {}), is_admin: nextIsAdmin }));
    }
  };

  useEffect(() => {
    if (isAdminPanelOpen) {
      loadAdminUsers();
    }
  }, [isAdminPanelOpen, loadAdminUsers]);

  const openCommunity = useCallback(
    (country) => {
      const code = normalizeCountryCode(country?.code);
      const resolvedCountry =
        countryOptions.find((option) => option.code === code) ||
        (code
          ? {
              code,
              name: getCountryName(code, language),
              flag: countryFlag(code),
            }
          : defaultCommunityCountry);
      setCommunityCountry(resolvedCountry);
      setIsCommunityOpen(true);
    },
    [countryOptions, defaultCommunityCountry, language],
  );

  const refreshCommunityPosts = useCallback(
    async (countryCode) => {
      const boardCode = normalizeCountryCode(countryCode);
      if (!supabase || !boardCode) return;

      setIsCommunityLoading(true);
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, is_admin)")
        .eq("country_code", boardCode)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setNotice(isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : t(language, "communityLoadError"));
        setCommunityPosts([]);
        setCommunityReplies([]);
        setCommunityVotes([]);
        setCommunityAuthorVisits(new Map());
        setIsCommunityLoading(false);
        return;
      }

      const posts = data || [];
      setCommunityPosts(posts);
      const postIds = posts.map((post) => post.id).filter(Boolean);
      if (postIds.length) {
        const [{ data: replyRows, error: replyError }, { data: voteRows, error: voteError }] = await Promise.all([
          supabase
            .from("community_replies")
            .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url, is_admin)")
            .in("post_id", postIds)
            .order("created_at", { ascending: true }),
          supabase.from("community_votes").select("*").in("post_id", postIds),
        ]);

        if (replyError) {
          setNotice(isMissingCommunityPostsError(replyError) ? t(language, "communitySetupRequired") : t(language, "communityLoadError"));
          setCommunityReplies([]);
        } else {
          setCommunityReplies(replyRows || []);
        }

        if (voteError) {
          setNotice(isMissingCommunityPostsError(voteError) ? t(language, "communitySetupRequired") : t(language, "communityLoadError"));
          setCommunityVotes([]);
        } else {
          setCommunityVotes(voteRows || []);
        }
      } else {
        setCommunityReplies([]);
        setCommunityVotes([]);
      }

      const authorIds = [...new Set(posts.map((post) => post.user_id).filter(Boolean))];

      if (!authorIds.length) {
        setCommunityAuthorVisits(new Map());
        setIsCommunityLoading(false);
        return;
      }

      const { data: visitsForAuthors } = await supabase
        .from("visited_countries")
        .select("user_id, country_code")
        .in("user_id", authorIds)
        .eq("country_code", boardCode);

      const visitMap = new Map(authorIds.map((id) => [id, new Set()]));
      (visitsForAuthors || []).forEach((visit) => {
        const current = visitMap.get(visit.user_id) || new Set();
        current.add(normalizeCountryCode(visit.country_code));
        visitMap.set(visit.user_id, current);
      });

      setCommunityAuthorVisits(visitMap);
      setIsCommunityLoading(false);
    },
    [language],
  );

  const handleCreateCommunityPost = useCallback(
    async ({ countryCode, title, body, imageFile }) => {
      const userId = session?.user?.id;
      const boardCode = normalizeCountryCode(countryCode);
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!boardCode) return { error: t(language, "countryNotFound") };

      setIsPostingCommunity(true);
      let imageUrl = null;

      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) {
          setIsPostingCommunity(false);
          return { error: t(language, "selectImageFile") };
        }
        if (imageFile.size > MAX_COMMUNITY_IMAGE_SIZE) {
          setIsPostingCommunity(false);
          return { error: t(language, "communityImageTooLarge") };
        }

        const extension = imageFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${userId}/${Date.now()}_${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("community-images").upload(path, imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: imageFile.type,
        });

        if (uploadError) {
          setIsPostingCommunity(false);
          return {
            error: isMissingCommunityImageBucketError(uploadError)
              ? t(language, "communityImageSetupRequired")
              : uploadError.message,
          };
        }

        const { data: publicData } = supabase.storage.from("community-images").getPublicUrl(path);
        imageUrl = publicData?.publicUrl || null;
      }

      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          country_code: boardCode,
          user_id: userId,
          title,
          body,
          image_url: imageUrl,
        })
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, is_admin)")
        .single();

      setIsPostingCommunity(false);

      if (error) {
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      if (data) {
        setCommunityPosts((current) => [data, ...current]);
        setCommunityAuthorVisits((current) => {
          const next = new Map(current);
          next.set(userId, new Set(visitState.mineSet));
          return next;
        });
      }

      return { data };
    },
    [language, session?.user?.id, visitState.mineSet],
  );

  const handleUpdateCommunityPost = useCallback(
    async (post, updates) => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!post?.id || post.user_id !== userId) return { error: t(language, "profileStillLoading") };

      let imageUrl = post.image_url || null;
      const oldImagePath = communityImagePathFromUrl(post.image_url);
      if (updates.imageFile) {
        if (!updates.imageFile.type.startsWith("image/")) {
          return { error: t(language, "selectImageFile") };
        }
        if (updates.imageFile.size > MAX_COMMUNITY_IMAGE_SIZE) {
          return { error: t(language, "communityImageTooLarge") };
        }

        const extension = updates.imageFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${userId}/${Date.now()}_${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("community-images").upload(path, updates.imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: updates.imageFile.type,
        });

        if (uploadError) {
          return {
            error: isMissingCommunityImageBucketError(uploadError)
              ? t(language, "communityImageSetupRequired")
              : uploadError.message,
          };
        }

        const { data: publicData } = supabase.storage.from("community-images").getPublicUrl(path);
        imageUrl = publicData?.publicUrl || imageUrl;
      }

      if (updates.removeImage && !updates.imageFile) {
        imageUrl = null;
      }

      const updatedAt = new Date().toISOString();
      let { data, error } = await supabase
        .from("community_posts")
        .update({
          title: updates.title,
          body: updates.body,
          image_url: imageUrl,
          updated_at: updatedAt,
        })
        .eq("id", post.id)
        .eq("user_id", userId)
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, is_admin)")
        .single();

      if (error && isMissingCommunityPostsError(error)) {
        const fallback = await supabase
          .from("community_posts")
          .update({
            title: updates.title,
            body: updates.body,
            image_url: imageUrl,
          })
          .eq("id", post.id)
          .eq("user_id", userId)
          .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, is_admin)")
          .single();
        data = fallback.data ? { ...fallback.data, updated_at: updatedAt } : fallback.data;
        error = fallback.error;
      }

      if (error) {
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      if (data) {
        setCommunityPosts((current) => current.map((item) => (item.id === data.id ? data : item)));
        if ((updates.removeImage || updates.imageFile) && oldImagePath) {
          await supabase.storage.from("community-images").remove([oldImagePath]);
        }
      }

      return { data };
    },
    [language, session?.user?.id],
  );

  const handleDeleteCommunityPost = useCallback(
    async (post) => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!post?.id || post.user_id !== userId) return { error: t(language, "profileStillLoading") };

      const previousPosts = communityPosts;
      const previousReplies = communityReplies;
      const previousVotes = communityVotes;
      setCommunityPosts((current) => current.filter((item) => item.id !== post.id));
      setCommunityReplies((current) => current.filter((reply) => reply.post_id !== post.id));
      setCommunityVotes((current) => current.filter((vote) => vote.post_id !== post.id));

      const { error } = await supabase
        .from("community_posts")
        .delete()
        .eq("id", post.id)
        .eq("user_id", userId);

      if (error) {
        setCommunityPosts(previousPosts);
        setCommunityReplies(previousReplies);
        setCommunityVotes(previousVotes);
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      const oldImagePath = communityImagePathFromUrl(post.image_url);
      if (oldImagePath) {
        await supabase.storage.from("community-images").remove([oldImagePath]);
      }

      return { data: true };
    },
    [communityPosts, communityReplies, communityVotes, language, session?.user?.id],
  );

  const handleCommunityVote = useCallback(
    async (postId, voteType) => {
      const userId = session?.user?.id;
      if (!supabase || !userId || !postId) return;

      const existing = communityVotes.find((vote) => vote.post_id === postId && vote.user_id === userId);
      if (existing?.vote_type === voteType) {
        setCommunityVotes((current) => current.filter((vote) => vote.id !== existing.id));
        const { error } = await supabase.from("community_votes").delete().eq("id", existing.id).eq("user_id", userId);
        if (error) {
          setNotice(isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message);
          refreshCommunityPosts(communityCountry?.code || defaultCommunityCountry?.code);
        }
        return;
      }

      if (existing) {
        setCommunityVotes((current) =>
          current.map((vote) => (vote.id === existing.id ? { ...vote, vote_type: voteType } : vote)),
        );
        const { data, error } = await supabase
          .from("community_votes")
          .update({ vote_type: voteType })
          .eq("id", existing.id)
          .eq("user_id", userId)
          .select("*")
          .single();
        if (error) {
          setNotice(isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message);
          refreshCommunityPosts(communityCountry?.code || defaultCommunityCountry?.code);
        } else if (data) {
          setCommunityVotes((current) => current.map((vote) => (vote.id === data.id ? data : vote)));
        }
        return;
      }

      const optimisticVote = {
        id: `local-${postId}-${userId}`,
        post_id: postId,
        user_id: userId,
        vote_type: voteType,
        created_at: new Date().toISOString(),
      };
      setCommunityVotes((current) => [...current, optimisticVote]);
      const { data, error } = await supabase
        .from("community_votes")
        .insert({ post_id: postId, user_id: userId, vote_type: voteType })
        .select("*")
        .single();
      if (error) {
        setNotice(isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message);
        setCommunityVotes((current) => current.filter((vote) => vote.id !== optimisticVote.id));
      } else if (data) {
        setCommunityVotes((current) => current.map((vote) => (vote.id === optimisticVote.id ? data : vote)));
      }
    },
    [communityCountry?.code, communityVotes, defaultCommunityCountry?.code, language, refreshCommunityPosts, session?.user?.id],
  );

  const handleCreateCommunityReply = useCallback(
    async (postId, body) => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!postId || !body.trim()) return { error: t(language, "communityReplyPlaceholder") };

      setReplyingPostId(postId);
      const { data, error } = await supabase
        .from("community_replies")
        .insert({
          post_id: postId,
          user_id: userId,
          body: body.trim(),
        })
        .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url, is_admin)")
        .single();
      setReplyingPostId("");

      if (error) {
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      if (data) {
        setCommunityReplies((current) => [...current, data]);
      }

      return { data };
    },
    [language, session?.user?.id],
  );

  const handleUpdateCommunityReply = useCallback(
    async (reply, body) => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!reply?.id || reply.user_id !== userId) return { error: t(language, "profileStillLoading") };

      const optimisticUpdatedAt = new Date().toISOString();
      setCommunityReplies((current) =>
        current.map((item) =>
          item.id === reply.id ? { ...item, body, updated_at: optimisticUpdatedAt } : item,
        ),
      );

      let { data, error } = await supabase
        .from("community_replies")
        .update({ body, updated_at: optimisticUpdatedAt })
        .eq("id", reply.id)
        .eq("user_id", userId)
        .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url, is_admin)")
        .single();

      if (error && isMissingCommunityPostsError(error)) {
        const fallback = await supabase
          .from("community_replies")
          .update({ body })
          .eq("id", reply.id)
          .eq("user_id", userId)
          .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url, is_admin)")
          .single();
        data = fallback.data ? { ...fallback.data, updated_at: optimisticUpdatedAt } : fallback.data;
        error = fallback.error;
      }

      if (error) {
        setCommunityReplies((current) => current.map((item) => (item.id === reply.id ? reply : item)));
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      if (data) {
        setCommunityReplies((current) => current.map((item) => (item.id === data.id ? data : item)));
      }

      return { data };
    },
    [language, session?.user?.id],
  );

  const handleDeleteCommunityReply = useCallback(
    async (reply) => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
      if (!reply?.id || reply.user_id !== userId) return { error: t(language, "profileStillLoading") };

      const previousReplies = communityReplies;
      setCommunityReplies((current) => current.filter((item) => item.id !== reply.id));

      const { error } = await supabase
        .from("community_replies")
        .delete()
        .eq("id", reply.id)
        .eq("user_id", userId);

      if (error) {
        setCommunityReplies(previousReplies);
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      return { data: true };
    },
    [communityReplies, language, session?.user?.id],
  );

  useEffect(() => {
    if (!isCommunityOpen) return;
    const board = communityCountry || defaultCommunityCountry;
    if (!communityCountry && board) {
      setCommunityCountry(board);
    }
    if (board?.code) {
      refreshCommunityPosts(board.code);
    }
  }, [communityCountry, defaultCommunityCountry, isCommunityOpen, refreshCommunityPosts]);

  const handleSaveUsername = async (username, nextLanguage) => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
    if (isUnsafeName(username)) return { error: t(language, "inappropriateName") };

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing && existing.id !== userId) {
      return { error: t(language, "usernameTaken") };
    }

    const updates = {
      username,
      language: nextLanguage || language,
    };

    let { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("*")
      .single();

    if (error && String(error.message || "").includes("language")) {
      const fallback = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", userId)
        .select("*")
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return { error: error.code === "23505" ? t(language, "usernameTaken") : error.message };
    }

    const updatedProfile = {
      ...(profile || {}),
      ...(data || {}),
      id: userId,
      username,
      language: nextLanguage || language,
    };

    setProfile(updatedProfile);
    setNotice("");
    return { data: updatedProfile };
  };

  const handleUploadAvatar = async (file) => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return { error: t(language, "profileStillLoading") };

    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

    if (uploadError) {
      const message = uploadError.message || "";
      const isMissingBucket =
        message.toLowerCase().includes("bucket not found") ||
        uploadError.statusCode === "404" ||
        uploadError.error === "Bucket not found";

      if (isMissingBucket) {
        return {
          error:
            "Avatar upload is not set up yet. In Supabase Storage, create a public bucket named exactly \"avatars\", then run supabase/migrations/002_profile_avatars.sql.",
        };
      }

      return { error: uploadError.message };
    }

    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = publicData?.publicUrl;

    if (!avatarUrl) {
      return { error: t(language, "avatarUrlError") };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      return { error: error.message };
    }

    const updatedProfile = {
      ...(profile || {}),
      ...(data || {}),
      id: userId,
    };
    setProfile(updatedProfile);
    return { data: updatedProfile };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (!session) return <LoginScreen />;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-brand">
          <img className="brand-logo brand-logo-header" src="/wyb-logo.png" alt="wyb" />
          <h1>
            {displayedVisitCount} {t(language, "countriesVisited")}
          </h1>
        </div>
        <div className="top-actions">
          {profile?.is_admin && (
            <button className="nav-action" onClick={() => setIsAdminPanelOpen(true)}>
              <Settings size={17} />
              <span>{t(language, "adminPanel")}</span>
            </button>
          )}
          <a className="instagram-top-link" href="https://www.instagram.com/gafl.ai" target="_blank" rel="noreferrer" aria-label="@gafl.ai">
            <Instagram size={17} />
          </a>
          <button className="nav-action" onClick={() => setIsShareOpen(true)}>
            <Share2 size={17} />
            <span>{t(language, "share")}</span>
          </button>
          <NotificationMenu
            activities={activities}
            friendRequests={friendRequests}
            language={language}
            isOpen={isNotificationMenuOpen}
            hasUnread={hasUnreadNotifications}
            onToggle={() => {
              setIsNotificationMenuOpen((current) => {
                const next = !current;
                if (next) {
                  setReadNotificationKey(notificationKey);
                  try {
                    window.localStorage.setItem("travel-map-read-notifications", notificationKey);
                  } catch {
                    // localStorage can be unavailable in privacy modes.
                  }
                }
                return next;
              });
              setIsAccountMenuOpen(false);
            }}
            onAcceptRequest={handleAcceptFriendRequest}
            onRejectRequest={handleRejectFriendRequest}
          />
          <AccountMenu
            profile={profile}
            language={language}
            isOpen={isAccountMenuOpen}
            onToggle={() => {
              setIsAccountMenuOpen((current) => !current);
              setIsNotificationMenuOpen(false);
            }}
            onProfileSettings={() => {
              setIsAccountMenuOpen(false);
              if (profile) {
                setIsProfileOpen(true);
              } else {
                setNotice(t(language, "profileStillLoading"));
              }
            }}
            onCountryCollection={() => {
              setIsAccountMenuOpen(false);
              setIsCountryCollectionOpen(true);
            }}
            onBadges={() => {
              setIsAccountMenuOpen(false);
              setIsBadgesOpen(true);
            }}
            onLogout={() => {
              setIsAccountMenuOpen(false);
              signOut();
            }}
          />
        </div>
      </header>

      {notice && (
        <button className="notice" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}

      {profile && !isValidUsername(profile.username || "") && (
        <UsernameSetupModal language={language} onSave={handleSaveUsername} />
      )}

      {profile && isProfileOpen && (
        <ProfileSettingsModal
          profile={profile}
          language={language}
          onClose={() => setIsProfileOpen(false)}
          onSave={handleSaveUsername}
          onUploadAvatar={handleUploadAvatar}
        />
      )}

      {isCountryCollectionOpen && (
        <CountryCollectionModal
          countriesByContinent={countriesByContinent}
          mineSet={visitState.mineSet}
          language={language}
          onClose={() => setIsCountryCollectionOpen(false)}
        />
      )}

      {isBadgesOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="badges-modal-title">
          <section className="collection-modal badges-modal">
            <div className="modal-title-row">
              <div>
                <p className="eyebrow">{t(language, "collection")}</p>
                <h2 id="badges-modal-title">{t(language, "badges")}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsBadgesOpen(false)} title={t(language, "close")} aria-label={t(language, "close")}>
                <X size={18} />
              </button>
            </div>
            <BadgesPanel visitCount={displayedVisitCount} stats={globalStats} language={language} compact />
          </section>
        </div>
      )}

      {isShareOpen && (
        <ShareStatsModal
          profile={profile}
          visitedCountries={visitedCountries}
          visitCount={displayedVisitCount}
          stats={globalStats}
          language={language}
          onClose={() => setIsShareOpen(false)}
          onNotice={setNotice}
        />
      )}

      {profile?.is_admin && isAdminPanelOpen && (
        <AdminManagementModal
          users={adminUsers}
          currentUserId={session?.user?.id}
          language={language}
          isLoading={isLoadingAdminUsers}
          onToggleAdmin={handleToggleAdmin}
          onClose={() => setIsAdminPanelOpen(false)}
        />
      )}

      <section className="workspace">
        <div className="map-wrap">
          <FriendMapRow
            profile={profile}
            friends={friends}
            selectedFriendId={selectedFriendId}
            language={language}
            onSelectFriend={setSelectedFriendId}
            onClearSelection={() => setSelectedFriendId("")}
          />
          {countryOptions.length > 0 && (
            <CountrySearch
              countries={countryOptions}
              language={language}
              onSelectCountry={setSelectedCountry}
              onMissingCountry={() => setNotice(t(language, "countryNotFound"))}
            />
          )}
          {geojson ? (
            <TravelMap
              geojson={geojson}
              visits={visitState}
              friendVisitMap={friendVisitMap}
              selectedCountry={selectedCountry}
              language={language}
              animatedCountryCode={animatedCountryCode}
              onSelectCountry={setSelectedCountry}
              onMarkVisited={handleMarkVisited}
              onRemoveVisited={handleRemoveVisited}
              onMissingCountry={() => setNotice(t(language, "countryNotFound"))}
              selectedFriend={selectedFriend}
            />
          ) : (
            <div className="map-fallback">
              <h2>{t(language, "loadingMap")}</h2>
              <p>{geojsonError || t(language, "mapFallback")}</p>
            </div>
          )}
          <CountryDetailCard
            country={selectedCountry}
            mineSet={visitState.mineSet}
            friendVisitMap={friendVisitMap}
            totalFriends={friends.length}
            language={language}
            isSaving={isSavingVisit}
            onMarkVisited={handleMarkVisited}
            onRemoveVisited={handleRemoveVisited}
            onClose={() => setSelectedCountry(null)}
          />
        </div>
        <div className="panel-stack">
          <ProfilePanel profile={profile} language={language} />
          <GlobalPercentilePanel stats={globalStats} language={language} />
          {profile?.is_admin && <AdminStatsPanel stats={globalStats} language={language} />}
          <SelectedFriendPanel
            friend={selectedFriend}
            visitCount={selectedFriendVisitSet.size}
            language={language}
            onClear={() => setSelectedFriendId("")}
          />
          {profile && (
            <FriendPanel
              friends={friends}
              friendQuery={friendQuery}
              setFriendQuery={setFriendQuery}
              language={language}
              onAddFriend={handleAddFriend}
              isAdding={isAddingFriend}
            />
          )}
          <LeaderboardPanel leaderboard={leaderboard} language={language} />
          <MostVisitedByFriendsPanel entries={mostVisitedByFriends} language={language} />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
