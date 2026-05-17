import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { ArrowDown, ArrowUp, Check, Edit3, Globe2, ImagePlus, Instagram, Landmark, LogOut, Medal, MessageCircle, Plus, RefreshCw, Search, Settings, X } from "lucide-react";
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

const WORLD_GEOJSON_URL = "/countries.geojson";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_COMMUNITY_IMAGE_SIZE = 5 * 1024 * 1024;
const LANDMARK_ZOOM_THRESHOLD = 8;
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
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: "abc",
  },
  ko: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: "abc",
  },
};
const TEXT = {
  en: {
    activity: "Activity",
    addByUsername: "Add by username",
    addFriendPrompt: "Add a username to compare visits on the map.",
    addFriendTitle: "Add friend",
    added: "added",
    addSupabaseEnvVars: "Add Supabase env vars",
    admin: "Admin",
    adminStats: "Admin stats",
    africa: "Africa",
    antarctica: "Antarctica",
    asia: "Asia",
    collection: "Collection",
    collected: "Collected",
    close: "Close",
    community: "Community",
    communityBody: "Body",
    communityBodyPlaceholder: "Share a quick note for this country board.",
    communityEditPost: "Edit",
    communityEmpty: "No posts yet. Start the board.",
    communityImageTooLarge: "Community images must be 5MB or smaller.",
    communityImageSetupRequired:
      "Community image upload is not set up yet. In Supabase Storage, create a public bucket named exactly \"community-images\", then run supabase/migrations/008_community_replies_images.sql.",
    communityLoadError: "Could not load community posts.",
    communityPost: "Post",
    communityReply: "Reply",
    communityReplyPlaceholder: "Write a reply...",
    communitySavePost: "Save post",
    communitySetupRequired:
      "Database setup required: run the latest community migrations in Supabase SQL Editor, then refresh this page.",
    communityTitle: "Title",
    communityTitlePlaceholder: "What should travelers know?",
    continueWithGoogle: "Continue with Google",
    countryCollection: "Country Collection",
    countryDetailsPrompt: "Country details, your visit status, and friend visits will appear here.",
    countryVisited: "I visited this country",
    countryVisitPercent: "{percent}% of users visited {country}",
    countriesVisited: "countries visited",
    currentUsername: "Current username",
    europe: "Europe",
    friend: "Friend",
    friendActivityEmpty: "Friend activity will show up here.",
    friendFallback: "A friend",
    friendVisitNone: "Friends: none",
    friendVisits: "Friends",
    friends: "Friends",
    friendsVisited: "Friends who visited",
    globalPercentile: "Global percentile",
    globalPercentileEmpty: "Not enough global data yet",
    globalPercentileTop: "You are in the top {percent}% of travelers",
    globalTotal: "Global total",
    go: "Go",
    guest: "Guest",
    instagram: "Instagram",
    language: "Language",
    landmarkCollection: "Landmark Collection",
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
    signOut: "Sign out",
    southAmerica: "South America",
    totalLandmarkVisits: "Total landmark visits",
    totalUsers: "Total users",
    totalVisitRecords: "Total visited country records",
    uploadAvatar: "Upload avatar",
    uploadImage: "Upload image",
    username: "Username",
    homeCountry: "Home country",
    homeRole: "Home",
    noHomeCountry: "No home country set",
    chooseHomeCountry: "Choose your home country",
    chooseHomeCountryCopy: "Your home country is tracked separately and does not count as a normal visited country.",
    saveHomeCountry: "Save home country",
    selectHomeCountryRequired: "Select a home country to continue.",
    countryNotFound: "Country not found on the map.",
    databaseSetupRequired:
      "Database setup required: run supabase/migrations/006_profiles_home_country_guard.sql in Supabase SQL Editor, then refresh this page.",
    removeVisited: "Remove from visited",
    badges: "Badges",
    unlocked: "Unlocked",
    locked: "Locked",
    globalRarity: "{percent}% of users unlocked this",
    usernameSetupTitle: "Choose a username",
    usernameSetupCopy: "Friends will find you by this name.",
    usernameRules: "Use 3-20 lowercase letters, numbers, or underscores.",
    saveUsername: "Save username",
    visited: "Visited",
    both: "Both",
    visitedVerb: "visited",
    worldSeen: "Mark the world you have seen.",
    yes: "YES",
    no: "NO",
    youVisited: "You visited",
    noFriendsCountry: "No friends have marked this country yet.",
    noTravelerFound: "No traveler found for that username.",
    ownUsername: "That is your own username.",
    validUsernameRequired: "Enter a valid username.",
    usernameTaken: "Username already taken",
    friendAdded: "{username} added.",
    avatarTooLarge: "Avatar image must be 2MB or smaller.",
    avatarUrlError: "Could not get avatar URL.",
  },
  ko: {
    activity: "활동",
    addByUsername: "사용자명으로 추가",
    addFriendPrompt: "사용자명을 추가해 지도에서 여행 기록을 비교하세요.",
    addFriendTitle: "친구 추가",
    added: "명 추가됨",
    addSupabaseEnvVars: "Supabase 환경 변수 추가",
    admin: "관리자",
    adminStats: "관리자 통계",
    africa: "아프리카",
    antarctica: "남극",
    asia: "아시아",
    collection: "컬렉션",
    collected: "수집 완료",
    close: "닫기",
    community: "커뮤니티",
    communityBody: "내용",
    communityBodyPlaceholder: "이 나라 게시판에 짧은 글을 남겨보세요.",
    communityEditPost: "수정",
    communityEmpty: "아직 글이 없습니다. 첫 글을 올려보세요.",
    communityImageTooLarge: "커뮤니티 이미지는 5MB 이하여야 합니다.",
    communityImageSetupRequired:
      "커뮤니티 이미지 업로드 설정이 필요합니다. Supabase Storage에서 public bucket 이름을 정확히 \"community-images\"로 만들고 supabase/migrations/008_community_replies_images.sql을 실행해 주세요.",
    communityLoadError: "커뮤니티 글을 불러오지 못했습니다.",
    communityPost: "게시",
    communityReply: "답글",
    communityReplyPlaceholder: "답글을 입력하세요...",
    communitySavePost: "글 저장",
    communitySetupRequired:
      "데이터베이스 설정이 필요합니다: Supabase SQL Editor에서 최신 community migration을 실행한 뒤 새로고침해 주세요.",
    communityTitle: "제목",
    communityTitlePlaceholder: "여행자들이 알면 좋은 내용은?",
    continueWithGoogle: "Google로 계속하기",
    countryCollection: "국가 컬렉션",
    countryDetailsPrompt: "국가 상세 정보, 방문 상태, 친구 방문 기록이 여기에 표시됩니다.",
    countryVisited: "이 나라를 방문했어요",
    countryVisitPercent: "사용자 {percent}%가 {country}을/를 방문했습니다",
    countriesVisited: "개국 방문",
    currentUsername: "현재 사용자명",
    europe: "유럽",
    friend: "친구",
    friendActivityEmpty: "친구 활동이 여기에 표시됩니다.",
    friendFallback: "친구",
    friendVisitNone: "친구: 없음",
    friendVisits: "친구",
    friends: "친구",
    friendsVisited: "방문한 친구",
    globalPercentile: "글로벌 상위 비율",
    globalPercentileEmpty: "아직 글로벌 데이터가 부족합니다",
    globalPercentileTop: "여행자 상위 {percent}%입니다",
    globalTotal: "전체 진행률",
    go: "이동",
    guest: "방문자",
    instagram: "인스타그램",
    language: "언어",
    landmarkCollection: "랜드마크 컬렉션",
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
    signOut: "로그아웃",
    southAmerica: "남아메리카",
    totalLandmarkVisits: "전체 랜드마크 방문",
    totalUsers: "전체 사용자",
    totalVisitRecords: "전체 국가 방문 기록",
    uploadAvatar: "아바타 업로드",
    uploadImage: "이미지 업로드",
    username: "사용자명",
    homeCountry: "홈 국가",
    homeRole: "홈",
    noHomeCountry: "홈 국가 미설정",
    chooseHomeCountry: "홈 국가를 선택하세요",
    chooseHomeCountryCopy: "홈 국가는 일반 방문 국가와 별도로 저장됩니다.",
    saveHomeCountry: "홈 국가 저장",
    selectHomeCountryRequired: "계속하려면 홈 국가를 선택해 주세요.",
    countryNotFound: "지도에서 해당 국가를 찾지 못했습니다.",
    databaseSetupRequired:
      "데이터베이스 설정이 필요합니다: Supabase SQL Editor에서 supabase/migrations/006_profiles_home_country_guard.sql을 실행한 뒤 새로고침해 주세요.",
    removeVisited: "방문 기록에서 제거",
    badges: "배지",
    unlocked: "해제됨",
    locked: "잠김",
    globalRarity: "사용자 {percent}%가 해제했습니다",
    usernameSetupTitle: "사용자명 만들기",
    usernameSetupCopy: "친구들이 이 이름으로 나를 찾을 수 있어요.",
    usernameRules: "3-20자의 소문자, 숫자, 밑줄만 사용할 수 있습니다.",
    saveUsername: "사용자명 저장",
    visited: "방문 완료",
    both: "공통",
    visitedVerb: "방문",
    worldSeen: "내가 본 세계를 기록하세요.",
    yes: "예",
    no: "아니요",
    youVisited: "내 방문",
    noFriendsCountry: "아직 이 나라를 방문한 친구가 없습니다.",
    noTravelerFound: "해당 사용자명을 찾을 수 없습니다.",
    ownUsername: "내 사용자명은 추가할 수 없습니다.",
    validUsernameRequired: "올바른 사용자명을 입력해 주세요.",
    usernameTaken: "이미 사용 중인 사용자명입니다",
    friendAdded: "{username}님을 추가했습니다.",
    avatarTooLarge: "아바타 이미지는 2MB 이하여야 합니다.",
    avatarUrlError: "아바타 URL을 가져오지 못했습니다.",
  },
};
const LANDMARKS = [
  {
    id: "statue-of-liberty",
    imageUrl: "https://images.unsplash.com/photo-1605130284535-11dd9eedc58a?auto=format&fit=crop&w=420&q=80",
    name: "Statue of Liberty",
    countryCode: "US",
    country: "United States",
    city: "New York",
    lat: 40.6892,
    lng: -74.0445,
    description:
      "A famous symbol of freedom and one of the most iconic landmarks in the United States.",
  },
  {
    id: "tokyo-tower",
    imageUrl: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=420&q=80",
    name: "Tokyo Tower",
    countryCode: "JP",
    country: "Japan",
    city: "Tokyo",
    lat: 35.6586,
    lng: 139.7454,
    description: "A bright communications tower and beloved symbol of Tokyo's skyline.",
  },
  {
    id: "marina-bay-sands",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Marina_Bay_Sands_at_night_%281%29.jpg/330px-Marina_Bay_Sands_at_night_%281%29.jpg",
    name: "Marina Bay Sands",
    countryCode: "SG",
    country: "Singapore",
    city: "Singapore",
    lat: 1.2834,
    lng: 103.8607,
    description: "A striking waterfront resort and one of Singapore's most recognizable skyline landmarks.",
  },
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

function isMissingHomeCountryColumnError(error) {
  return String(error?.message || error || "")
    .toLowerCase()
    .includes("home_country_code");
}

function isMissingCommunityPostsError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("community_posts") ||
    message.includes("community_replies") ||
    message.includes("community_votes") ||
    message.includes("image_url") ||
    message.includes("schema cache")
  );
}

function isMissingCommunityImageBucketError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("bucket not found") || error?.statusCode === "404" || error?.error === "Bucket not found";
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function getHomeCountryDisplay(profile, language) {
  const code = normalizeCountryCode(profile?.home_country_code);
  if (!code) return "";
  return `${countryFlag(code)} ${getCountryName(code, language)}`;
}

function getCommunityRole({ countryCode, homeCountryCode, visitedSet }) {
  const boardCode = normalizeCountryCode(countryCode);
  if (boardCode && normalizeCountryCode(homeCountryCode) === boardCode) return "home";
  if (visitedSet?.has?.(boardCode)) return "visited";
  return "guest";
}

function getRoleLabel(role, language) {
  if (role === "home") return t(language, "homeRole");
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
  const username = user?.username || "Traveler";

  return user?.avatar_url ? (
    <img className={`avatar avatar-${size}`} src={user.avatar_url} alt={`${username} avatar`} />
  ) : (
    <span className={`avatar avatar-${size} avatar-fallback`} aria-label={`${username} avatar`}>
      {avatarLetter(username)}
    </span>
  );
}

function createAvatarIcon(friends) {
  const visible = friends.slice(0, 3);
  const extra = friends.length - visible.length;
  const html = `
    <div class="map-avatar-stack">
      ${visible
        .map((friend) => {
          const username = escapeHtml(friend.username || "Friend");
          const avatarUrl = escapeHtml(friend.avatar_url || "");
          return avatarUrl
            ? `<img class="map-avatar" src="${avatarUrl}" alt="${username}" />`
            : `<span class="map-avatar map-avatar-fallback" title="${username}">${escapeHtml(
                avatarLetter(friend.username),
              )}</span>`;
        })
        .join("")}
      ${extra > 0 ? `<span class="map-avatar-extra">+${extra}</span>` : ""}
    </div>
  `;

  return L.divIcon({
    className: "map-avatar-marker",
    html,
    iconSize: [92, 32],
    iconAnchor: [18, 16],
  });
}

function createLandmarkIcon(landmark, collected) {
  const imageUrl = escapeHtml(landmark.imageUrl || "");
  const fallback = escapeHtml(landmark.name.charAt(0));
  return L.divIcon({
    className: "landmark-marker",
    html: imageUrl
      ? `<img class="landmark-marker-photo ${collected ? "is-collected" : ""}" src="${imageUrl}" alt="${escapeHtml(
          landmark.name,
        )}" />`
      : `<span class="landmark-marker-photo landmark-marker-fallback ${collected ? "is-collected" : ""}">${fallback}</span>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -24],
  });
}

function getFeatureBoundsCenter(feature) {
  const points = [];
  const collect = (coords) => {
    if (typeof coords?.[0] === "number" && typeof coords?.[1] === "number") {
      points.push(coords);
      return;
    }
    coords?.forEach(collect);
  };

  collect(feature.geometry?.coordinates);
  if (!points.length) return null;

  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  const lng = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const lat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;

  return [lat, Math.max(-179.5, Math.min(179.5, lng))];
}

function getIsoA2FromFeature(feature) {
  const props = feature?.properties || {};
  const iso = props.ISO_A2 || props.iso_a2 || props["ISO3166-1-Alpha-2"];
  return /^[A-Z]{2}$/i.test(String(iso || "")) ? normalizeCountryCode(iso) : "";
}

function getCountryStyle(feature, context) {
  const code = getIsoA2FromFeature(feature);
  const homeCountryCode = normalizeCountryCode(context.homeCountryCode);
  const selected = context.selectedCountryCode === code;
  const isHomeCountry = Boolean(homeCountryCode && code === homeCountryCode);
  const isUserVisited = context.visitedMine.has(code);
  const isFriendVisited = context.visitedFriend.has(code);

  const base = {
    lineCap: "round",
    lineJoin: "round",
    renderer: context.renderer,
  };

  if (isHomeCountry) {
    return {
      ...base,
      color: "#b91c1c",
      weight: selected ? 2.2 : 1.5,
      opacity: selected ? 0.78 : 0.52,
      fill: true,
      fillColor: "#ef4444",
      fillOpacity: selected ? 0.38 : 0.28,
    };
  }

  if (isUserVisited && isFriendVisited) {
    return {
      ...base,
      color: "#b45309",
      weight: selected ? 1.5 : 0.75,
      opacity: selected ? 0.5 : 0.26,
      fill: true,
      fillColor: "#f59e0b",
      fillOpacity: selected ? 0.34 : 0.3,
    };
  }

  if (isUserVisited) {
    return {
      ...base,
      color: "#0369a1",
      weight: selected ? 1.5 : 0.7,
      opacity: selected ? 0.46 : 0.24,
      fill: true,
      fillColor: "#38bdf8",
      fillOpacity: selected ? 0.28 : 0.24,
    };
  }

  if (isFriendVisited) {
    return {
      ...base,
      color: "#059669",
      weight: selected ? 1.45 : 0.7,
      opacity: selected ? 0.42 : 0.22,
      fill: true,
      fillColor: "#6ee7b7",
      fillOpacity: selected ? 0.24 : 0.2,
    };
  }

  return {
    ...base,
    color: selected ? "#64748b" : "#cbd5e1",
    weight: selected ? 1.25 : 0.45,
    opacity: selected ? 0.34 : 0.14,
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
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div>
          <p className="eyebrow">Travel Map</p>
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

function HomeCountrySetupModal({ countryOptions, language, onSave }) {
  const [homeCountryCode, setHomeCountryCode] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (event) => {
    event.preventDefault();
    const typed = query.trim().toLowerCase();
    const selected =
      countryOptions.find((country) => country.code === homeCountryCode) ||
      countryOptions.find((country) => country.name.toLowerCase() === typed) ||
      countryOptions.find((country) => country.code.toLowerCase() === typed);
    const normalized = normalizeCountryCode(selected?.code);
    if (!normalized) {
      setError(t(language, "selectHomeCountryRequired"));
      return;
    }

    setIsSaving(true);
    setError("");
    const result = await onSave(normalized);
    setIsSaving(false);

    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="home-country-title">
      <form className="username-modal profile-modal" onSubmit={handleSave}>
        <div>
          <p className="eyebrow">{t(language, "homeCountry")}</p>
          <h2 id="home-country-title">{t(language, "chooseHomeCountry")}</h2>
          <p>{t(language, "chooseHomeCountryCopy")}</p>
        </div>

        <label className="field-label">
          {t(language, "homeCountry")}
          <input
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              const selected = countryOptions.find((country) => country.name === nextQuery);
              setHomeCountryCode(selected?.code || "");
            }}
            placeholder={t(language, "searchCountry")}
            aria-label={t(language, "homeCountry")}
            list="home-country-options"
            autoFocus
          />
          <datalist id="home-country-options">
            {countryOptions.map((country) => (
              <option key={country.code} value={country.name} />
            ))}
          </datalist>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-action" disabled={isSaving}>
          {isSaving ? t(language, "saving") : t(language, "saveHomeCountry")}
        </button>
      </form>
    </div>
  );
}

function FriendAvatarMarkers({ geojson, friendVisitMap, onSelectCountry }) {
  const markers = useMemo(() => {
    return (geojson?.features || [])
      .map((feature) => {
        const code = countryCodeFromFeature(feature);
        const friends = friendVisitMap.get(code) || [];
        if (!friends.length) return null;

        const position = getFeatureBoundsCenter(feature);
        if (!position) return null;

        return {
          code,
          name: countryNameFromFeature(feature),
          flag: countryFlag(code),
          friends,
          position,
        };
      })
      .filter(Boolean);
  }, [friendVisitMap, geojson]);

  return markers.map((marker) => (
    <Marker
      key={marker.code}
      position={marker.position}
      icon={createAvatarIcon(marker.friends)}
      eventHandlers={{
        click: () => onSelectCountry({ code: marker.code, name: marker.name, flag: marker.flag }),
      }}
    />
  ));
}

function LandmarkMarkers({ landmarks, collectedSet, language, onCollect }) {
  return landmarks.map((landmark) => {
    const collected = collectedSet.has(landmark.id);

    return (
      <Marker
        key={landmark.id}
        position={[landmark.lat, landmark.lng]}
        icon={createLandmarkIcon(landmark, collected)}
        title={landmark.name}
      >
        <Popup className="landmark-popup">
          <div className="landmark-popup-content">
            {landmark.imageUrl && <img className="landmark-popup-photo" src={landmark.imageUrl} alt={landmark.name} />}
            <div className="landmark-popup-title">
              <div>
                <h3>{landmark.name}</h3>
                <p>
                  {landmark.city}, {getCountryName(landmark.countryCode, language) || landmark.country}
                </p>
              </div>
            </div>
            <span className={`collection-status ${collected ? "collected" : ""}`}>
              {collected ? t(language, "collected") : t(language, "notVisited")}
            </span>
            <p>{landmark.description}</p>
            <button className="popup-button" onClick={() => onCollect(landmark.id)} disabled={collected}>
              {collected ? t(language, "visited") : t(language, "markAsVisited")}
            </button>
          </div>
        </Popup>
      </Marker>
    );
  });
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
    targetLayer.openPopup?.();
  }, [geoJsonRef, map, onMissingCountry, selectedCountry?.code, selectedCountry?.focus, selectedCountry?.focusKey]);

  return null;
}

function TravelMap({
  geojson,
  visits,
  friendVisitMap,
  selectedCountry,
  landmarks,
  collectedLandmarkSet,
  language,
  animatedCountryCode,
  homeCountryCode,
  onSelectCountry,
  onMarkVisited,
  onRemoveVisited,
  onCollectLandmark,
  onMissingCountry,
}) {
  const geoJsonRef = useRef(null);
  const [zoom, setZoom] = useState(2);
  const countryRenderer = useMemo(() => L.canvas({ padding: 0.5, tolerance: 4 }), []);

  const visitedMine = visits.mineSet;
  const visitedFriend = visits.friendSet;
  const homeCode = normalizeCountryCode(homeCountryCode);
  const landmarkMode = zoom >= LANDMARK_ZOOM_THRESHOLD;
  const tileLayer = TILE_LAYERS[language] || TILE_LAYERS.en;

  useEffect(() => {
    console.log("Home country:", homeCode);
  }, [homeCode]);

  const styleFeature = useCallback(
    (feature) =>
      getCountryStyle(feature, {
        homeCountryCode: homeCode,
        selectedCountryCode: selectedCountry?.code,
        visitedMine,
        visitedFriend,
        renderer: countryRenderer,
      }),
    [countryRenderer, homeCode, selectedCountry?.code, visitedFriend, visitedMine],
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
        click: () => {
          onSelectCountry({ code, flag });
          layer.openPopup();
        },
        mouseover: () => {
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

      layer.bindPopup(() => {
        const name = getCountryName(code, language) || countryNameFromFeature(feature);
        const mine = visitedMine.has(code);
        const isHome = homeCode && code === homeCode;
        const friends = friendVisitMap.get(code) || [];
        const friendList = friends.length
          ? `<div class="popup-friends">${t(language, "friendVisits")}: ${friends
              .map((friend) => friend.username)
              .join(", ")}</div>`
          : `<div class="popup-friends">${t(language, "friendVisitNone")}</div>`;
        const wrapper = L.DomUtil.create("div", "country-popup");
        wrapper.innerHTML = `
          <div class="popup-title">${flag} ${name}</div>
          ${friendList}
          <button class="popup-button" ${isHome ? "disabled" : ""}>
            ${isHome ? t(language, "homeCountry") : mine ? t(language, "removeVisited") : t(language, "countryVisited")}
          </button>
        `;
        const button = wrapper.querySelector("button");
        L.DomEvent.on(button, "click", (event) => {
          L.DomEvent.stop(event);
          if (isHome) return;
          if (mine) {
            onRemoveVisited({ code, flag });
          } else {
            onMarkVisited({ code, flag });
          }
        });
        return wrapper;
      });
    },
    [friendVisitMap, homeCode, language, onMarkVisited, onRemoveVisited, onSelectCountry, styleFeature, visitedMine],
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
        key={`${visitedMine.size}-${visitedFriend.size}-${language}`}
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
      <FriendAvatarMarkers geojson={geojson} friendVisitMap={friendVisitMap} onSelectCountry={onSelectCountry} />
      {landmarkMode && (
        <LandmarkMarkers
          landmarks={landmarks}
          collectedSet={collectedLandmarkSet}
          language={language}
          onCollect={onCollectLandmark}
        />
      )}
      <MapLegend language={language} />
    </MapContainer>
  );
}

function CountryPanel({
  country,
  mineSet,
  friendVisitMap,
  language,
  homeCountryCode,
  onMarkVisited,
  onRemoveVisited,
  onOpenCommunity,
  isSaving,
}) {
  const friends = country ? friendVisitMap.get(country.code) || [] : [];
  const isHome = Boolean(country && homeCountryCode && country.code === homeCountryCode);
  const mine = country ? mineSet.has(country.code) : false;
  const displayName = country ? getCountryName(country.code, language) || country.name : "";

  return (
    <aside className="side-panel country-panel">
      {country ? (
        <>
          <div className="panel-heading">
            <h2>
              {country.flag} {displayName}
            </h2>
            <p>
              {isHome ? t(language, "homeCountry") : `${t(language, "youVisited")}: ${mine ? t(language, "yes") : t(language, "no")}`}
            </p>
          </div>
          <button
            className={mine ? "secondary-action danger-action" : "primary-action"}
            onClick={() => (mine ? onRemoveVisited(country) : onMarkVisited(country))}
            disabled={isSaving || isHome}
          >
            <Check size={17} />
            {isHome ? t(language, "homeCountry") : mine ? t(language, "removeVisited") : t(language, "countryVisited")}
          </button>
          <button className="secondary-action" onClick={() => onOpenCommunity(country)}>
            <MessageCircle size={17} />
            {t(language, "community")}
          </button>
          <div>
            <h3>{t(language, "friendsVisited")}</h3>
            {friends.length ? (
              <ul className="simple-list avatar-list">
                {friends.map((friend) => (
                  <li key={friend.id}>
                    <Avatar user={friend} size="sm" />
                    <span>{friend.username}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-text">{t(language, "noFriendsCountry")}</p>
            )}
          </div>
        </>
      ) : (
        <div className="panel-placeholder">
          <h2>{t(language, "searchCountry")}</h2>
          <p>{t(language, "countryDetailsPrompt")}</p>
        </div>
      )}
    </aside>
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
              <Avatar user={friend} size="sm" />
              {friend.username}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">{t(language, "addFriendPrompt")}</p>
      )}
    </aside>
  );
}

function ProfilePanel({ profile, language }) {
  const homeCountryDisplay = getHomeCountryDisplay(profile, language);
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
            <p className="profile-home-line">
              {homeCountryDisplay || `🏳 ${t(language, "noHomeCountry")}`}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function InstagramPanel({ language }) {
  return (
    <aside className="side-panel instagram-panel">
      <a href="https://www.instagram.com/gafl.ai" target="_blank" rel="noreferrer">
        <Instagram size={17} />
        <span>@gafl.ai</span>
        <small>{t(language, "instagram")}</small>
      </a>
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
              <span className="leaderboard-name">{entry.username}</span>
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
          <p className="eyebrow">Travel Map</p>
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

function ProfileSettingsModal({ profile, language, countryOptions = [], onClose, onSave, onUploadAvatar }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [homeCountryCode, setHomeCountryCode] = useState(profile?.home_country_code || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const normalized = normalizeUsername(username);
  const homeCountryDisplay = getHomeCountryDisplay(
    { ...profile, home_country_code: homeCountryCode || profile?.home_country_code },
    language,
  );

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");

    if (!isValidUsername(normalized)) {
      setError(t(language, "usernameRules"));
      return;
    }

    if (!homeCountryCode) {
      setError(t(language, "selectHomeCountryRequired"));
      return;
    }

    setIsSaving(true);
    const result = await onSave(normalized, selectedLanguage, homeCountryCode);
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
            <small>{homeCountryDisplay || t(language, "noHomeCountry")}</small>
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

        <label className="field-label">
          {t(language, "homeCountry")}
          <select
            value={homeCountryCode || ""}
            onChange={(event) => setHomeCountryCode(event.target.value)}
            aria-label={t(language, "homeCountry")}
          >
            <option value="">{t(language, "selectHomeCountryRequired")}</option>
            {countryOptions.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.name}
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

function ActivityFeed({ activities, language }) {
  return (
    <aside className="side-panel activity-feed">
      <div className="panel-heading">
        <h2>{t(language, "activity")}</h2>
        <p>{t(language, "recentFriendVisits")}</p>
      </div>
      {activities.length ? (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Avatar user={activity.profiles} size="sm" />
              <span>{activity.profiles?.username || t(language, "friendFallback")}</span>
              <span>
                {t(language, "visitedVerb")} {countryFlag(activity.country_code)}{" "}
                {getCountryName(activity.country_code, language)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">{t(language, "friendActivityEmpty")}</p>
      )}
    </aside>
  );
}

function LandmarkCollectionModal({ landmarks, collectedSet, language, onCollect, onClose }) {
  const collectedCount = landmarks.filter((landmark) => collectedSet.has(landmark.id)).length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="landmark-title">
      <section className="collection-modal">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">Collection</p>
            <h2 id="landmark-title">{t(language, "landmarkCollection")}</h2>
            <p>
              {collectedCount}/{landmarks.length}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title={t(language, "close")} aria-label={t(language, "close")}>
            <X size={18} />
          </button>
        </div>

        <div className="landmark-grid">
          {landmarks.map((landmark) => {
            const collected = collectedSet.has(landmark.id);

            return (
              <article className={`landmark-card ${collected ? "is-collected" : ""}`} key={landmark.id}>
                {landmark.imageUrl ? (
                  <img className="landmark-card-photo" src={landmark.imageUrl} alt={landmark.name} />
                ) : (
                  <div className="landmark-card-photo landmark-card-fallback" aria-hidden="true">
                    {landmark.name.charAt(0)}
                  </div>
                )}
                <div className="landmark-card-body">
                  <div className="landmark-card-heading">
                    <div>
                      <h3>{landmark.name}</h3>
                      <p>
                        {landmark.city}, {getCountryName(landmark.countryCode, language) || landmark.country}
                      </p>
                    </div>
                    <span className={`collection-status ${collected ? "collected" : ""}`}>
                      {collected ? t(language, "collected") : t(language, "notVisited")}
                    </span>
                  </div>
                  <p className="landmark-description">{landmark.description}</p>
                  <button
                    className={`landmark-action-button ${collected ? "secondary-action" : "primary-action"}`}
                    onClick={() => onCollect(landmark.id)}
                    disabled={collected}
                  >
                    <Check size={17} />
                    {collected ? t(language, "visited") : t(language, "markAsVisited")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CountryCollectionModal({ countriesByContinent, mineSet, homeCountryCode, language, onClose }) {
  const totalVisited = CONTINENT_ORDER.reduce((sum, continent) => {
    return (
      sum +
      countriesByContinent[continent].filter(
        (country) => mineSet.has(country.code) || country.code === homeCountryCode,
      ).length
    );
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
            const visited = countriesForContinent.filter(
              (country) => mineSet.has(country.code) || country.code === homeCountryCode,
            ).length;
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
                    const visitedCountry = mineSet.has(country.code) || country.code === homeCountryCode;
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
  homeCountryCode,
  mineSet,
  authorVisitedMap,
  onSelectCountry,
  onCreatePost,
  onUpdatePost,
  onCreateReply,
  onVote,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [error, setError] = useState("");

  const boardCountry = selectedCountry || countries[0];
  const boardCode = normalizeCountryCode(boardCountry?.code);
  const myRole = getCommunityRole({ countryCode: boardCode, homeCountryCode, visitedSet: mineSet });

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
                : t(language, "globalPercentileEmpty")}
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
                homeCountryCode: author.home_country_code,
                visitedSet: authorVisits,
              });
              return (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  author={author}
                  role={role}
                  voteSummary={voteSummaryByPost.get(post.id) || { score: 0, myVote: "" }}
                  currentUserId={currentUserId}
                  language={language}
                  onUpdatePost={onUpdatePost}
                  onVote={onVote}
                >
                  <ReplyList
                    post={post}
                    replies={repliesByPost.get(post.id) || []}
                    language={language}
                    isSaving={replyingPostId === post.id}
                    onCreateReply={onCreateReply}
                  />
                </CommunityPostCard>
              );
            })
          ) : (
            <p className="empty-text">{t(language, "communityEmpty")}</p>
          )}
        </div>
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
  onVote,
  children,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(post.title || "");
  const [body, setBody] = useState(post.body || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
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
    const result = await onUpdatePost(post, { title: cleanTitle, body: cleanBody, imageFile });
    setIsSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setIsEditing(false);
  };

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
            <RoleBadge role={role} language={language} />
            <span>{formatTimestamp(post.created_at, language)}</span>
            {canEdit && (
              <button className="post-edit-button" onClick={() => setIsEditing((current) => !current)}>
                <Edit3 size={14} />
                {t(language, "communityEditPost")}
              </button>
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
                    setImageFile(file);
                  }}
                />
              </label>
              {(imagePreview || post.image_url) && (
                <div className="community-image-preview">
                  <img src={imagePreview || post.image_url} alt="" />
                  {imagePreview && (
                    <button type="button" className="icon-button" onClick={() => setImageFile(null)} aria-label={t(language, "close")}>
                      <X size={16} />
                    </button>
                  )}
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

          {!isEditing && children}
        </div>
      </div>
    </article>
  );
}

function ReplyList({ post, replies, language, isSaving, onCreateReply }) {
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
            <li key={reply.id}>
              <Avatar user={reply.profiles} size="sm" />
              <div>
                <div className="reply-meta">
                  <strong>{reply.profiles?.username || t(language, "friendFallback")}</strong>
                  <span>{formatTimestamp(reply.created_at, language)}</span>
                </div>
                <p>{reply.body}</p>
              </div>
            </li>
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

function BadgesPanel({ visitCount, stats, language }) {
  return (
    <aside className="side-panel badges-panel">
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
        <span>{t(language, "totalLandmarkVisits")}</span>
        <strong>{stats.totalLandmarkVisits ?? "-"}</strong>
      </div>
    </aside>
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
  const [activities, setActivities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLandmarkOpen, setIsLandmarkOpen] = useState(false);
  const [isCountryCollectionOpen, setIsCountryCollectionOpen] = useState(false);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityCountry, setCommunityCountry] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityReplies, setCommunityReplies] = useState([]);
  const [communityVotes, setCommunityVotes] = useState([]);
  const [communityVisitPercent, setCommunityVisitPercent] = useState(null);
  const [communityAuthorVisits, setCommunityAuthorVisits] = useState(new Map());
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isPostingCommunity, setIsPostingCommunity] = useState(false);
  const [replyingPostId, setReplyingPostId] = useState("");
  const [landmarkVisits, setLandmarkVisits] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [animatedCountryCode, setAnimatedCountryCode] = useState("");

  const language = getLanguage(profile);
  const homeCountryCode = normalizeCountryCode(profile?.home_country_code);

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
      countryOptions.find((country) => country.code === homeCountryCode) ||
      countryOptions.find((country) => country.code === selectedCountry?.code) ||
      countryOptions[0] ||
      null
    );
  }, [countryOptions, homeCountryCode, selectedCountry?.code]);

  const visitState = useMemo(() => {
    const mineSet = new Set(
      mineVisits
        .map((visit) => normalizeCountryCode(visit.country_code))
        .filter((code) => code && code !== homeCountryCode),
    );
    const friendSet = new Set(friendVisits.map((visit) => normalizeCountryCode(visit.country_code)));
    return { mineSet, friendSet };
  }, [friendVisits, homeCountryCode, mineVisits]);

  const displayedVisitCount = visitState.mineSet.size + (homeCountryCode ? 1 : 0);

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
      entries.push({
        ...friend,
        username: friend.username || "Friend",
        visitCount: new Set(
          friendVisits
            .filter((visit) => visit.user_id === friend.id)
            .map((visit) => normalizeCountryCode(visit.country_code)),
        ).size,
      });
    });

    return entries.sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return a.username.localeCompare(b.username);
    });
  }, [displayedVisitCount, friendVisits, friends, profile]);

  const collectedLandmarkSet = useMemo(() => {
    const userId = session?.user?.id;
    return new Set(
      landmarkVisits
        .filter((visit) => visit.user_id === userId)
        .map((visit) => visit.landmark_id),
    );
  }, [landmarkVisits, session?.user?.id]);

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
    console.log("[travel-map] authenticated user id", user.id);
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      console.log("[travel-map] loaded profile id", existingProfile.id);
      console.log("[travel-map] fetched profile", existingProfile);
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
        console.log("[travel-map] loaded profile id", data.id);
        console.log("[travel-map] fetched profile", data);
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

    console.log("[travel-map] authenticated user id", userId);

    const [{ data: myData }, { data: friendRows }] = await Promise.all([
      supabase.from("visited_countries").select("*").eq("user_id", userId),
      supabase
        .from("friends")
        .select("friend_id, friend:profiles!friends_friend_id_fkey(id, username, avatar_url)")
        .eq("user_id", userId),
    ]);

    const friendProfiles = (friendRows || []).map((row) => row.friend).filter(Boolean);
    const friendIds = friendProfiles.map((friend) => friend.id);

    console.log("[travel-map] fetched visited countries count", myData?.length || 0);
    console.log("[travel-map] fetched friends count", friendProfiles.length);
    setMineVisits(myData || []);
    setFriends(friendProfiles);

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
    setActivities(
      (activityData || []).map((activity) => ({
        ...activity,
        country_name: countryNames.get(normalizeCountryCode(activity.country_code)) || activity.country_code,
      })),
    );
  }, [countryNames, session?.user?.id]);

  const refreshGlobalStats = useCallback(async () => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return;

    const [{ data: profileRows, error: profileStatsError }, { count: totalVisitRecords }, { data: visitRows }] = await Promise.all([
      supabase.from("profiles").select("id, home_country_code"),
      supabase.from("visited_countries").select("id", { count: "exact", head: true }),
      supabase.from("visited_countries").select("user_id, country_code"),
    ]);
    if (isMissingHomeCountryColumnError(profileStatsError)) {
      setNotice(t(language, "databaseSetupRequired"));
    }

    let totalLandmarkVisits = landmarkVisits.length;
    const { count: landmarkCount, error: landmarkCountError } = await supabase
      .from("landmark_visits")
      .select("id", { count: "exact", head: true });
    if (!landmarkCountError) {
      totalLandmarkVisits = landmarkCount || 0;
    }

    const userVisitCounts = new Map();
    (profileRows || []).forEach((profileRow) => {
      const codes = new Set();
      const homeCode = normalizeCountryCode(profileRow.home_country_code);
      if (homeCode) codes.add(homeCode);
      userVisitCounts.set(profileRow.id, codes);
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

    setGlobalStats({
      hasEnoughUsers: usersWithVisits >= 3,
      percentile,
      topPercent,
      totalUsers: totalUserCount,
      totalVisitRecords: totalVisitRecords || 0,
      totalLandmarkVisits,
      badgeRarities,
    });
  }, [landmarkVisits.length, session?.user?.id]);

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
    refreshGlobalStats();
  }, [homeCountryCode, refreshGlobalStats, mineVisits.length]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!supabase || !userId || !homeCountryCode) return;

    const hasHomeInVisits = mineVisits.some(
      (visit) => normalizeCountryCode(visit.country_code) === homeCountryCode,
    );
    if (!hasHomeInVisits) return;

    setMineVisits((current) =>
      current.filter((visit) => normalizeCountryCode(visit.country_code) !== homeCountryCode),
    );
    supabase
      .from("visited_countries")
      .delete()
      .eq("user_id", userId)
      .eq("country_code", homeCountryCode)
      .then(({ error }) => {
        if (error) setNotice(error.message);
      });
  }, [homeCountryCode, mineVisits, session?.user?.id]);

  useEffect(() => {
    const loadLandmarkVisits = async () => {
      const userId = session?.user?.id;
      if (!supabase || !userId) return;

      const { data, error } = await supabase.from("landmark_visits").select("*").eq("user_id", userId);
      if (!error && data) {
        setLandmarkVisits(data);
      }
    };

    loadLandmarkVisits();
  }, [session?.user?.id]);

  const handleMarkVisited = useCallback(
    async (country) => {
      const userId = session?.user?.id;
      if (
        !supabase ||
        !userId ||
        !country?.code ||
        country.code === homeCountryCode ||
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
    [homeCountryCode, refreshSocialData, session?.user?.id, visitState.mineSet],
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

    const { error } = await supabase.from("friends").insert({
      user_id: userId,
      friend_id: friend.id,
    });

    if (error && error.code !== "23505") {
      setNotice(error.message);
    } else {
      setFriendQuery("");
      setNotice(formatText(language, "friendAdded", { username: friend.username }));
      refreshSocialData();
    }

    setIsAddingFriend(false);
  };

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
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, home_country_code)")
        .eq("country_code", boardCode)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setNotice(isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : t(language, "communityLoadError"));
        setCommunityPosts([]);
        setCommunityReplies([]);
        setCommunityVotes([]);
        setCommunityVisitPercent(null);
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
            .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url)")
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

      const [{ data: profileRows }, { data: countryVisitRows }] = await Promise.all([
        supabase.from("profiles").select("id, home_country_code"),
        supabase.from("visited_countries").select("user_id, country_code").eq("country_code", boardCode),
      ]);
      const totalUsers = profileRows?.length || 0;
      const visitedUsers = new Set((countryVisitRows || []).map((visit) => visit.user_id));
      (profileRows || []).forEach((profileRow) => {
        if (normalizeCountryCode(profileRow.home_country_code) === boardCode) {
          visitedUsers.add(profileRow.id);
        }
      });
      setCommunityVisitPercent({
        hasData: totalUsers > 0,
        totalUsers,
        visitedUsers: visitedUsers.size,
        percent: totalUsers ? Math.round((visitedUsers.size / totalUsers) * 100) : 0,
      });

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
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, home_country_code)")
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

      const { data, error } = await supabase
        .from("community_posts")
        .update({
          title: updates.title,
          body: updates.body,
          image_url: imageUrl,
        })
        .eq("id", post.id)
        .eq("user_id", userId)
        .select("*, profiles!community_posts_user_id_fkey(id, username, avatar_url, home_country_code)")
        .single();

      if (error) {
        return {
          error: isMissingCommunityPostsError(error) ? t(language, "communitySetupRequired") : error.message,
        };
      }

      if (data) {
        setCommunityPosts((current) => current.map((item) => (item.id === data.id ? data : item)));
      }

      return { data };
    },
    [language, session?.user?.id],
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
        .select("*, profiles!community_replies_user_id_fkey(id, username, avatar_url)")
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

  const handleSaveUsername = async (username, nextLanguage, nextHomeCountryCode) => {
    const userId = session?.user?.id;
    if (!supabase || !userId) return { error: t(language, "profileStillLoading") };

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existing && existing.id !== userId) {
      return { error: t(language, "usernameTaken") };
    }

    const shouldUpdateHomeCountry = nextHomeCountryCode !== undefined;
    const resolvedHomeCountryCode = shouldUpdateHomeCountry
      ? normalizeCountryCode(nextHomeCountryCode)
      : homeCountryCode;
    const updates = {
      username,
      language: nextLanguage || language,
    };

    if (shouldUpdateHomeCountry) {
      updates.home_country_code = resolvedHomeCountryCode || null;
    }

    let { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("*")
      .single();

    if (error && isMissingHomeCountryColumnError(error) && shouldUpdateHomeCountry) {
      return { error: t(language, "databaseSetupRequired") };
    }

    if (error && isMissingHomeCountryColumnError(error)) {
      const fallback = await supabase
        .from("profiles")
        .update({ username, language: nextLanguage || language })
        .eq("id", userId)
        .select("*")
        .single();
      data = fallback.data;
      error = fallback.error;
    }

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
      home_country_code: data?.home_country_code ?? resolvedHomeCountryCode ?? profile?.home_country_code ?? null,
    };

    setProfile(updatedProfile);
    if (shouldUpdateHomeCountry && resolvedHomeCountryCode) {
      setMineVisits((current) =>
        current.filter((visit) => normalizeCountryCode(visit.country_code) !== resolvedHomeCountryCode),
      );
      await supabase
        .from("visited_countries")
        .delete()
        .eq("user_id", userId)
        .eq("country_code", resolvedHomeCountryCode);
    }
    setNotice("");
    return { data: updatedProfile };
  };

  const handleSaveHomeCountry = async (nextHomeCountryCode) => {
    const userId = session?.user?.id;
    const resolvedHomeCountryCode = normalizeCountryCode(nextHomeCountryCode);
    if (!supabase || !userId) return { error: t(language, "profileStillLoading") };
    if (!resolvedHomeCountryCode) return { error: t(language, "selectHomeCountryRequired") };

    const { data, error } = await supabase
      .from("profiles")
      .update({ home_country_code: resolvedHomeCountryCode })
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      return {
        error: isMissingHomeCountryColumnError(error) ? t(language, "databaseSetupRequired") : error.message,
      };
    }

    setProfile((current) => ({
      ...(current || {}),
      ...(data || {}),
      id: userId,
      home_country_code: data?.home_country_code ?? resolvedHomeCountryCode,
    }));
    setMineVisits((current) =>
      current.filter((visit) => normalizeCountryCode(visit.country_code) !== resolvedHomeCountryCode),
    );
    await supabase
      .from("visited_countries")
      .delete()
      .eq("user_id", userId)
      .eq("country_code", resolvedHomeCountryCode);
    refreshSocialData();

    return { data };
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
      home_country_code: data?.home_country_code ?? profile?.home_country_code ?? null,
    };
    setProfile(updatedProfile);
    return { data: updatedProfile };
  };

  const handleCollectLandmark = async (landmarkId) => {
    const userId = session?.user?.id;
    if (!userId || collectedLandmarkSet.has(landmarkId)) return;

    const optimisticVisit = {
      id: `local-${userId}-${landmarkId}`,
      user_id: userId,
      landmark_id: landmarkId,
      created_at: new Date().toISOString(),
    };

    setLandmarkVisits((current) => [...current, optimisticVisit]);

    if (!supabase) return;

    const { data, error } = await supabase
      .from("landmark_visits")
      .insert({ user_id: userId, landmark_id: landmarkId })
      .select("*")
      .single();

    if (!error && data) {
      setLandmarkVisits((current) =>
        current.map((visit) => (visit.id === optimisticVisit.id ? data : visit)),
      );
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (!session) return <LoginScreen />;

  const landmarkProgress = `${collectedLandmarkSet.size}/${LANDMARKS.length}`;

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Travel Map</p>
          <h1>
            {displayedVisitCount} {t(language, "countriesVisited")}
          </h1>
        </div>
        <div className="top-actions">
          <button className="landmark-button" onClick={() => setIsCountryCollectionOpen(true)}>
            <Globe2 size={17} />
            <span>{t(language, "countryCollection")}</span>
          </button>
          <button className="landmark-button" onClick={() => setIsLandmarkOpen(true)}>
            <Landmark size={17} />
            <span>
              {t(language, "landmarkCollection")} {landmarkProgress}
            </span>
          </button>
          <button className="landmark-button" onClick={() => openCommunity(selectedCountry || defaultCommunityCountry)}>
            <MessageCircle size={17} />
            <span>{t(language, "community")}</span>
          </button>
          <button className="icon-button" onClick={refreshSocialData} title={t(language, "refresh")} aria-label={t(language, "refresh")}>
            <RefreshCw size={18} />
          </button>
          <button
            className="profile-button"
            onClick={() => {
              if (profile) {
                setIsProfileOpen(true);
              } else {
                setNotice(t(language, "profileStillLoading"));
              }
            }}
            title={t(language, "settings")}
            aria-label={t(language, "settings")}
          >
            <Avatar user={profile || { username: "Profile" }} size="sm" />
            <span>{t(language, "profile")}</span>
            <Settings size={16} />
          </button>
          <button className="icon-button" onClick={signOut} title={t(language, "signOut")} aria-label={t(language, "signOut")}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {notice && (
        <button className="notice" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}

      {profile && !homeCountryCode && countryOptions.length > 0 && (
        <HomeCountrySetupModal
          countryOptions={countryOptions}
          language={language}
          onSave={handleSaveHomeCountry}
        />
      )}

      {profile && homeCountryCode && !isValidUsername(profile.username || "") && (
        <UsernameSetupModal language={language} onSave={handleSaveUsername} />
      )}

      {profile && isProfileOpen && (
        <ProfileSettingsModal
          profile={profile}
          language={language}
          countryOptions={countryOptions}
          onClose={() => setIsProfileOpen(false)}
          onSave={handleSaveUsername}
          onUploadAvatar={handleUploadAvatar}
        />
      )}

      {isCountryCollectionOpen && (
        <CountryCollectionModal
          countriesByContinent={countriesByContinent}
          mineSet={visitState.mineSet}
          homeCountryCode={homeCountryCode}
          language={language}
          onClose={() => setIsCountryCollectionOpen(false)}
        />
      )}

      {isLandmarkOpen && (
        <LandmarkCollectionModal
          landmarks={LANDMARKS}
          collectedSet={collectedLandmarkSet}
          language={language}
          onCollect={handleCollectLandmark}
          onClose={() => setIsLandmarkOpen(false)}
        />
      )}

      {isCommunityOpen && (
        <CommunityModal
          countries={countryOptions}
          selectedCountry={communityCountry || defaultCommunityCountry}
          posts={communityPosts}
          repliesByPost={communityRepliesByPost}
          voteSummaryByPost={communityVoteSummaryByPost}
          currentUserId={session?.user?.id}
          visitPercent={communityVisitPercent}
          isLoading={isCommunityLoading}
          isPosting={isPostingCommunity}
          replyingPostId={replyingPostId}
          language={language}
          homeCountryCode={homeCountryCode}
          mineSet={visitState.mineSet}
          authorVisitedMap={communityAuthorVisits}
          onSelectCountry={setCommunityCountry}
          onCreatePost={handleCreateCommunityPost}
          onUpdatePost={handleUpdateCommunityPost}
          onCreateReply={handleCreateCommunityReply}
          onVote={handleCommunityVote}
          onClose={() => setIsCommunityOpen(false)}
        />
      )}

      <section className="workspace">
        <div className="map-wrap">
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
              landmarks={LANDMARKS}
              collectedLandmarkSet={collectedLandmarkSet}
              language={language}
              animatedCountryCode={animatedCountryCode}
              homeCountryCode={homeCountryCode}
              onSelectCountry={setSelectedCountry}
              onMarkVisited={handleMarkVisited}
              onRemoveVisited={handleRemoveVisited}
              onCollectLandmark={handleCollectLandmark}
              onMissingCountry={() => setNotice(t(language, "countryNotFound"))}
            />
          ) : (
            <div className="map-fallback">
              <h2>{t(language, "loadingMap")}</h2>
              <p>{geojsonError || t(language, "mapFallback")}</p>
            </div>
          )}
        </div>
        <div className="panel-stack">
          <ProfilePanel profile={profile} language={language} />
          <InstagramPanel language={language} />
          <GlobalPercentilePanel stats={globalStats} language={language} />
          <BadgesPanel visitCount={displayedVisitCount} stats={globalStats} language={language} />
          {profile?.is_admin && <AdminStatsPanel stats={globalStats} language={language} />}
          <CountryPanel
            country={selectedCountry}
            mineSet={visitState.mineSet}
            friendVisitMap={friendVisitMap}
            language={language}
            homeCountryCode={homeCountryCode}
            onMarkVisited={handleMarkVisited}
            onRemoveVisited={handleRemoveVisited}
            onOpenCommunity={openCommunity}
            isSaving={isSavingVisit}
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
          <ActivityFeed activities={activities} language={language} />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
