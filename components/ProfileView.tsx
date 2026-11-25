import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  type TextInputInstance,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import Avatar from "./Avatar";
import LumoLikeIcon from "./LumoLikeIcon";
import PostCommentsSheet from "./PostCommentsSheet";
import LumoVideoPlayer from "./LumoVideoPlayer";
import UniversalForwardModal from './UniversalForwardModal';
import type { ForwardSource } from './UniversalForwardModal';
import { Alert } from "../lib/alert";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { getPlatformRoles, type PlatformRole } from "../lib/market-official";
import { isUserPremium } from "../lib/membership";
import { colors } from "../lib/theme";
import { getProfileLayoutMetrics } from "../lib/responsive";
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";
import { usePreferences } from "../lib/preferences";
import { t } from "../lib/localization";


const C = {
  bg: "#090C12",
  mediaBg: "#010101",
  panel: "#12161C",
  panel2: "#1A2029",
  border: "#2B3440",
  text: "#F2F5F7",
  muted: "#9AA5B2",
  lime: "#B9C7D6",
  limeDark: "#252D16",
  danger: "#FF6478",
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.68)",
};

type Thumb = {
  id: string;
  user_id: string;
  image_url: string | null;
  video_url?: string | null;
  media_type?: string | null;
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  caption?: string | null;
};

type PostComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
};

type Person = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type PostRow = {
  id: string;
  items: Thumb[];
};

type ConnectionMode = "followers" | "following";

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

export default function ProfileView({ userId }: { userId: string }) {
  const lumoStyles = useThemedStyles(styles);
  const { locale, palette } = usePreferences();
  const { session, signOut } = useAuth();
  const me = session?.user?.id;
  const isMe = !!me && userId === me;
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const segments = useSegments();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Thumb[]>([]);
  const [savedPosts, setSavedPosts] = useState<Thumb[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "saved">(
    "posts",
  );
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [selectedPost, setSelectedPost] = useState<Thumb | null>(null);
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);
  const [postVisible, setPostVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [postDetailsLoading, setPostDetailsLoading] = useState(false);
  const [postDeleteLoading, setPostDeleteLoading] = useState(false);
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [commentDeleteLoading, setCommentDeleteLoading] = useState(false);

  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [likersVisible, setLikersVisible] = useState(false);
  const [likers, setLikers] = useState<Person[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);

  const [connectionsVisible, setConnectionsVisible] = useState(false);
  const [connectionsMode, setConnectionsMode] =
    useState<ConnectionMode>("followers");
  const [connections, setConnections] = useState<Person[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  const [bioExpanded, setBioExpanded] = useState(false);
  const [myPlatformRoles, setMyPlatformRoles] = useState<PlatformRole[]>([]);
  const [profilePlatformRoles, setProfilePlatformRoles] = useState<PlatformRole[]>([]);
  const [isPremiumProfile, setIsPremiumProfile] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const canManageMemberRoles = myPlatformRoles.includes("owner") || myPlatformRoles.includes("developer") || myPlatformRoles.includes("admin");
  const targetIsAdmin = profilePlatformRoles.includes("admin");
  const profileRoleLabel = profilePlatformRoles.includes("developer") || profilePlatformRoles.includes("owner")
    ? "DEVELOPER"
    : profilePlatformRoles.includes("admin")
      ? "ADMIN"
      : "PERSONAL";

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const postScrollRef = useRef<ScrollViewInstance | null>(null);
  const commentInputRef = useRef<TextInputInstance | null>(null);
  const imagePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomScale = useRef(new Animated.Value(1)).current;
  const zoomTranslateX = useRef(new Animated.Value(0)).current;
  const zoomTranslateY = useRef(new Animated.Value(0)).current;
  const zoomScaleValue = useRef(1);
  const zoomTranslateValue = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const lastTouchCount = useRef(0);
  const panStart = useRef({ x: 0, y: 0 });
  const panGestureOrigin = useRef({ x: 0, y: 0 });

  const resetImageZoom = () => {
    zoomScaleValue.current = 1;
    zoomTranslateValue.current = { x: 0, y: 0 };
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    lastTouchCount.current = 0;
    zoomScale.setValue(1);
    zoomTranslateX.setValue(0);
    zoomTranslateY.setValue(0);
  };

  const openImageViewer = () => {
    if (imagePressTimerRef.current) clearTimeout(imagePressTimerRef.current);
    imagePressTimerRef.current = null;
    resetImageZoom();
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
    resetImageZoom();
  };

  const imageZoomResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) =>
      (event.nativeEvent.touches?.length ?? 0) >= 2,
    onStartShouldSetPanResponder: (event) =>
      (event.nativeEvent.touches?.length ?? 0) >= 2 || zoomScaleValue.current > 1.01,
    onMoveShouldSetPanResponder: (event, gesture) =>
      (event.nativeEvent.touches?.length ?? 0) >= 2 ||
      (zoomScaleValue.current > 1.01 &&
        (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)),
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches ?? [];
      lastTouchCount.current = touches.length;
      if (touches.length >= 2) {
        const [first, second] = touches;
        pinchStartDistance.current = Math.hypot(
          second.pageX - first.pageX,
          second.pageY - first.pageY,
        );
        pinchStartScale.current = zoomScaleValue.current;
      } else {
        panStart.current = { ...zoomTranslateValue.current };
        panGestureOrigin.current = { x: 0, y: 0 };
      }
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches ?? [];
      if (touches.length >= 2) {
        const [first, second] = touches;
        const distance = Math.hypot(
          second.pageX - first.pageX,
          second.pageY - first.pageY,
        );
        if (lastTouchCount.current < 2 || !pinchStartDistance.current) {
          pinchStartDistance.current = distance;
          pinchStartScale.current = zoomScaleValue.current;
        }
        const nextScale = Math.max(
          1,
          Math.min(4, pinchStartScale.current * distance / Math.max(1, pinchStartDistance.current)),
        );
        zoomScaleValue.current = nextScale;
        zoomScale.setValue(nextScale);
        if (nextScale <= 1.01) {
          zoomTranslateValue.current = { x: 0, y: 0 };
          zoomTranslateX.setValue(0);
          zoomTranslateY.setValue(0);
        }
      } else {
        if (lastTouchCount.current >= 2) {
          panStart.current = { ...zoomTranslateValue.current };
          panGestureOrigin.current = { x: gesture.dx, y: gesture.dy };
        }
        if (zoomScaleValue.current > 1.01) {
          const limitX = Math.max(0, width * (zoomScaleValue.current - 1) / 2);
          const limitY = Math.max(0, height * (zoomScaleValue.current - 1) / 2);
          const x = Math.max(-limitX, Math.min(limitX, panStart.current.x + gesture.dx - panGestureOrigin.current.x));
          const y = Math.max(-limitY, Math.min(limitY, panStart.current.y + gesture.dy - panGestureOrigin.current.y));
          zoomTranslateValue.current = { x, y };
          zoomTranslateX.setValue(x);
          zoomTranslateY.setValue(y);
        }
      }
      lastTouchCount.current = touches.length;
    },
    onPanResponderRelease: () => {
      pinchStartDistance.current = 0;
      lastTouchCount.current = 0;
      if (zoomScaleValue.current <= 1.01) resetImageZoom();
    },
    onPanResponderTerminate: () => {
      pinchStartDistance.current = 0;
      lastTouchCount.current = 0;
    },
  }), [height, width, zoomScale, zoomTranslateX, zoomTranslateY]);

  const pressScale = (value: Animated.Value, to: number) => {
    Animated.spring(value, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const primaryBtnScale = useRef(new Animated.Value(1)).current;

  const focusPostComment = () => {
    postScrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => commentInputRef.current?.focus(), 250);
  };

  const load = useCallback(async () => {
    if (!me) {
      setProfile(null);
      setPosts([]);
      setIsPremiumProfile(false);
      setLoadError("Please sign in to view this profile.");
      return;
    }

    const nextMyRoles = await getPlatformRoles(me);
    setMyPlatformRoles(nextMyRoles);
    if (isMe) {
      setProfilePlatformRoles(nextMyRoles);
    } else if (nextMyRoles.includes("owner") || nextMyRoles.includes("developer") || nextMyRoles.includes("admin")) {
      setProfilePlatformRoles(await getPlatformRoles(userId));
    } else {
      setProfilePlatformRoles([]);
    }

    setIsPremiumProfile(false);
    const [profileResult, postsResult, followersResult, followingResult, premiumProfile] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, full_name, bio, avatar_url")
          .eq("id", userId)
          .maybeSingle(),

        supabase
          .from("posts")
          .select("id, user_id, image_url, video_url, media_type, media_path, media_mime_type, media_file_name, caption")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),

        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", userId),

        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", userId),

        isUserPremium(userId).catch(() => false),
      ]);

    if (profileResult.error) throw profileResult.error;
    if (postsResult.error) throw postsResult.error;
    if (followersResult.error) throw followersResult.error;
    if (followingResult.error) throw followingResult.error;

    setProfile((profileResult.data as Profile | null) ?? null);
    setIsPremiumProfile(premiumProfile);
    setPosts((postsResult.data as Thumb[]) ?? []);
    setFollowers(followersResult.count ?? 0);
    setFollowing(followingResult.count ?? 0);
    setLoadError("");

    if (isMe) {
      setIsFollowing(false);
      try {
        const { data: savedRows } = await supabase
          .from("saved_post")
          .select("post_id, posts(id, user_id, image_url, video_url, media_type, media_path, media_mime_type, media_file_name, caption)")
          .eq("user_id", me)
          .order("created_at", { ascending: false });
        if (savedRows) {
          const list: Thumb[] = [];
          for (const row of savedRows as any[]) {
            if (row.posts?.id) { list.push(row.posts as Thumb); }
          }
          setSavedPosts(list);
        }
      } catch {
        // Ignore saved post load failure
      }
      return;
    }

    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", me)
      .eq("following_id", userId)
      .maybeSingle();

    if (error) throw error;

    setIsFollowing(!!data);
  }, [userId, me, isMe]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        setLoading(true);

        try {
          await load();
        } catch (error) {
          if (active) {
            setLoadError(getErrorMessage(error));
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      void run();

      return () => {
        active = false;
      };
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);

    try {
      await load();
    } catch (error) {
      Alert.alert("Error", getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const loadPostDetails = async (postId: string) => {
    if (!me) return;

    setPostDetailsLoading(true);

    try {
      const [likeResult, myLikeResult, commentResult, saveResult] =
        await Promise.all([
          supabase
            .from("likes")
            .select("*", { count: "exact", head: true })
            .eq("post_id", postId),

          supabase
            .from("likes")
            .select("*")
            .eq("post_id", postId)
            .eq("user_id", me)
            .maybeSingle(),

          supabase
            .from("comments")
            .select("id, user_id, body, created_at")
            .eq("post_id", postId)
            .order("created_at", { ascending: true }),

          supabase
            .from("saved_post")
            .select("*")
            .eq("post_id", postId)
            .eq("user_id", me)
            .maybeSingle(),
        ]);

      if (likeResult.error) throw likeResult.error;
      if (myLikeResult.error) throw myLikeResult.error;
      if (commentResult.error) throw commentResult.error;
      if (saveResult.error) throw saveResult.error;

      setLikesCount(likeResult.count ?? 0);
      setLiked(!!myLikeResult.data);
      setSaved(!!saveResult.data);

      const rows = commentResult.data ?? [];
      setCommentsCount(rows.length);
      const userIds = [...new Set(rows.map((item) => item.user_id))];

      const userMap = new Map<
        string,
        { username: string; avatar_url: string | null }
      >();

      if (userIds.length > 0) {
        const { data: users, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", userIds);

        if (error) throw error;

        (users ?? []).forEach((user) => {
          userMap.set(user.id, {
            username: user.username ?? "User",
            avatar_url: user.avatar_url ?? null,
          });
        });
      }

      setComments(
        rows.map((item) => {
          const user = userMap.get(item.user_id);

          return {
            ...item,
            body: item.body ?? "",
            username: user?.username ?? "User",
            avatar_url: user?.avatar_url ?? null,
          };
        }),
      );
    } catch (error) {
      Alert.alert("Could not load post", getErrorMessage(error));
    } finally {
      setPostDetailsLoading(false);
    }
  };

  const openPost = async (post: Thumb) => {
    if (imagePressTimerRef.current) clearTimeout(imagePressTimerRef.current);
    imagePressTimerRef.current = null;
    setImageViewerVisible(false);
    resetImageZoom();
    setSelectedPost(post);
    setPostVisible(true);
    setLikersVisible(false);
    setCommentText("");
    setLiked(false);
    setLikesCount(0);
    setSaved(false);
    setComments([]);
    setCommentsCount(0);
    setCommentsSheetVisible(false);

    await loadPostDetails(post.id);
  };

  const closePost = () => {
    if (imagePressTimerRef.current) clearTimeout(imagePressTimerRef.current);
    imagePressTimerRef.current = null;
    setCommentsSheetVisible(false);
    setPostVisible(false);
    setLikersVisible(false);
    setSelectedPost(null);
  };

  const deleteSelectedPost = async () => {
    if (!selectedPost || !me || selectedPost.user_id !== me || postDeleteLoading) return;

    setPostDeleteLoading(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .delete()
        .eq("id", selectedPost.id)
        .eq("user_id", me)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(t(locale, "Could not delete the post. Check your permissions and try again."));

      setPosts((current) => current.filter((item) => item.id !== selectedPost.id));
      setSavedPosts((current) => current.filter((item) => item.id !== selectedPost.id));
      setImageViewerVisible(false);
      setCommentsSheetVisible(false);
      setLikersVisible(false);
      setPostVisible(false);
      setSelectedPost(null);
    } catch {
      Alert.alert(
        t(locale, "Post could not be deleted"),
        t(locale, "Could not delete the post. Check your permissions and try again."),
      );
    } finally {
      setPostDeleteLoading(false);
    }
  };

  const requestDeleteSelectedPost = () => {
    if (!selectedPost || selectedPost.user_id !== me || postDeleteLoading) return;

    Alert.alert(
      t(locale, "Delete this post?"),
      t(locale, "This post will be permanently deleted. This action cannot be undone."),
      [
        { text: t(locale, "Cancel"), style: "cancel" },
        { text: t(locale, "Delete"), style: "destructive", onPress: () => void deleteSelectedPost() },
      ],
    );
  };

  const toggleLike = async () => {
    if (!selectedPost || !me || likeLoading) return;

    setLikeLoading(true);

    const next = !liked;

    try {
      const result = next
        ? await supabase.from("likes").insert({
            post_id: selectedPost.id,
            user_id: me,
          })
        : await supabase
            .from("likes")
            .delete()
            .eq("post_id", selectedPost.id)
            .eq("user_id", me);

      if (result.error) throw result.error;

      setLiked(next);
      setLikesCount((count) => Math.max(0, count + (next ? 1 : -1)));
    } catch (error) {
      Alert.alert("Like failed", getErrorMessage(error));
    } finally {
      setLikeLoading(false);
    }
  };

  const burstLike = () => {
    heartScale.setValue(0.3);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1.1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 10,
      }),
      Animated.timing(heartOpacity, {
        toValue: 0,
        duration: 650,
        delay: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleImagePress = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 280;

    if (isDoubleTap) {
      if (imagePressTimerRef.current) clearTimeout(imagePressTimerRef.current);
      imagePressTimerRef.current = null;
      lastTapRef.current = 0;
      burstLike();
      if (!liked) void toggleLike();
      return;
    }

    lastTapRef.current = now;
    if (imagePressTimerRef.current) clearTimeout(imagePressTimerRef.current);
    imagePressTimerRef.current = setTimeout(() => {
      imagePressTimerRef.current = null;
      lastTapRef.current = 0;
      openImageViewer();
    }, 280);
  };

  const sendComment = async () => {
    if (!selectedPost || !me || !commentText.trim() || commentLoading) {
      return;
    }

    setCommentLoading(true);

    try {
      const { error } = await supabase.from("comments").insert({
        post_id: selectedPost.id,
        user_id: me,
        body: commentText.trim(),
      });

      if (error) throw error;

      setCommentText("");
      await loadPostDetails(selectedPost.id);
    } catch (error) {
      Alert.alert("Comment failed", getErrorMessage(error));
    } finally {
      setCommentLoading(false);
    }
  };

  const removeComment = async (commentId: string, commentUserId: string) => {
    if (!selectedPost || !me) return;
    const canDelete = commentUserId === me || profile?.id === me;
    if (!canDelete) return;

    setCommentToDelete(commentId);
  };

  const confirmRemoveComment = async () => {
    if (!selectedPost || !commentToDelete || commentDeleteLoading) return;

    setCommentDeleteLoading(true);

    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentToDelete)
        .eq("post_id", selectedPost.id);

      if (error) throw error;
      setCommentToDelete(null);
      await loadPostDetails(selectedPost.id);
    } catch (error) {
      Alert.alert("Delete failed", getErrorMessage(error));
    } finally {
      setCommentDeleteLoading(false);
    }
  };

  const toggleSave = async () => {
    if (!selectedPost || !me || saveLoading) return;

    setSaveLoading(true);

    const next = !saved;

    try {
      const result = next
        ? await supabase.from("saved_post").insert({
            post_id: selectedPost.id,
            user_id: me,
          })
        : await supabase
            .from("saved_post")
            .delete()
            .eq("post_id", selectedPost.id)
            .eq("user_id", me);

      if (result.error) throw result.error;

      setSaved(next);
    } catch (error) {
      Alert.alert("Save failed", getErrorMessage(error));
    } finally {
      setSaveLoading(false);
    }
  };

  const openLikers = async () => {
    if (!selectedPost || likesCount === 0) return;

    setLikersVisible(true);
    setLikersLoading(true);

    try {
      const { data, error } = await supabase
        .from("likes")
        .select("user_id")
        .eq("post_id", selectedPost.id);

      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((item) => item.user_id))];

      if (userIds.length === 0) {
        setLikers([]);
        return;
      }

      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      if (userError) throw userError;

      setLikers(
        (users ?? []).map((item) => ({
          id: item.id,
          username: item.username ?? "User",
          avatar_url: item.avatar_url ?? null,
        })),
      );
    } catch (error) {
      Alert.alert("Could not load likes", getErrorMessage(error));
    } finally {
      setLikersLoading(false);
    }
  };

  const openConnections = async (mode: ConnectionMode) => {
    if (!me) return;

    setConnectionsMode(mode);
    setConnectionsVisible(true);
    setConnectionsLoading(true);
    setConnections([]);

    try {
      let ids: string[] = [];

      if (mode === "followers") {
        const { data, error } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", userId);

        if (error) throw error;

        ids = [...new Set((data ?? []).map((item) => item.follower_id))];
      } else {
        const { data, error } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId);

        if (error) throw error;

        ids = [...new Set((data ?? []).map((item) => item.following_id))];
      }

      if (ids.length === 0) {
        setConnections([]);
        return;
      }

      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);

      if (userError) throw userError;

      setConnections(
        (users ?? []).map((item) => ({
          id: item.id,
          username: item.username ?? "User",
          avatar_url: item.avatar_url ?? null,
        })),
      );
    } catch (error) {
      Alert.alert("Could not load people", getErrorMessage(error));
    } finally {
      setConnectionsLoading(false);
    }
  };

  const toggleAdminRole = async () => {
    if (!me || isMe || !canManageMemberRoles || roleSaving) return;
    setRoleSaving(true);
    try {
      const { error } = await supabase.rpc(
        targetIsAdmin ? "revoke_platform_role" : "grant_platform_role",
        { p_user_id: userId, p_role: "admin" },
      );
      if (error) throw error;
      setProfilePlatformRoles((current) => targetIsAdmin
        ? current.filter((role) => role !== "admin")
        : [...current, "admin"]);
      Alert.alert(
        targetIsAdmin ? "Admin access removed" : "Admin access granted",
        targetIsAdmin
          ? "This member no longer has LUMO admin permissions."
          : "This member now has LUMO admin permissions.",
      );
    } catch (error) {
      Alert.alert("Role update failed", getErrorMessage(error));
    } finally {
      setRoleSaving(false);
    }
  };

  const toggleFollow = async () => {
    if (!me || isMe || followLoading) return;

    const next = !isFollowing;

    setIsFollowing(next);
    setFollowers((count) => Math.max(0, count + (next ? 1 : -1)));
    setFollowLoading(true);

    try {
      const result = next
        ? await supabase.from("follows").insert({
            follower_id: me,
            following_id: userId,
          })
        : await supabase
            .from("follows")
            .delete()
            .eq("follower_id", me)
            .eq("following_id", userId);

      if (result.error) throw result.error;
    } catch (error) {
      setIsFollowing(!next);
      setFollowers((count) => Math.max(0, count + (next ? -1 : 1)));
      Alert.alert("Follow failed", getErrorMessage(error));
    } finally {
      setFollowLoading(false);
    }
  };

    const sharePost = () => {
    if (!selectedPost || !me) return;
    const isVideo = selectedPost.media_type === "video" || Boolean(selectedPost.video_url);
    setPostVisible(false);
    setForwardSource({
      type: "post",
      id: selectedPost.id,
      senderLabel: profile?.username ?? "user",
      chatLabel: "Lumo post",
      body: selectedPost.caption ?? null,
      messageType: isVideo ? "video" : "image",
      mediaPath: selectedPost.media_path ?? null,
      mediaMimeType: selectedPost.media_mime_type ?? null,
      mediaFileName: selectedPost.media_file_name ?? selectedPost.media_path?.split("/").pop() ?? null,
    });
  };

  const confirmSignOut = () => {
    Alert.alert("Log out?", "You can sign in again at any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void signOut().catch((error: unknown) => {
            Alert.alert("Could not log out", getErrorMessage(error));
          });
        },
      },
    ]);
  };

  const currentPosts = useMemo(() => {
    if (activeTab === "saved") return savedPosts;
    if (activeTab === "reels") {
      return posts.filter(
        (post) => post.media_type === "video" || Boolean(post.video_url),
      );
    }
    return posts.filter(
      (post) => post.media_type !== "video" && !post.video_url,
    );
  }, [activeTab, posts, savedPosts]);

  const postRows = useMemo<PostRow[]>(() => {
    const rows: PostRow[] = [];

    for (let i = 0; i < currentPosts.length; i += 2) {
      rows.push({
        id: `row-${currentPosts[i].id}`,
        items: currentPosts.slice(i, i + 2),
      });
    }

    return rows;
  }, [currentPosts]);

  const profileLayout = getProfileLayoutMetrics(
    width,
    height,
    segments[0] === "(tabs)",
  );
  const { desktopProfile: isDesktopProfile, widePost: isWidePost, tileWidth } = profileLayout;

  const identityPanel = (
    <View style={lumoStyles.desktopIdentityPanel}>
      <View style={lumoStyles.desktopPanelTop}>
        <Text style={lumoStyles.desktopPanelHeading}>Profile</Text>
        {isMe && (
          <Pressable
            style={lumoStyles.desktopSettingsBtn}
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={19} color={C.text} />
          </Pressable>
        )}
      </View>

      <View style={lumoStyles.desktopAvatarFrame}>
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.username ?? ""}
          size={88}
          hasStory={false}
        />
        {isMe && (
          <View style={lumoStyles.avatarAddBadge}>
            <Ionicons name="add" size={13} color={C.bg} />
          </View>
        )}
      </View>

      <View style={lumoStyles.desktopNameRow}>
        <Text style={lumoStyles.desktopFullName} numberOfLines={2}>
          {profile?.full_name || profile?.username || "Lumo member"}
        </Text>
        {isPremiumProfile && (
          <Ionicons name="checkmark-circle" size={19} color={resolveThemeColor("#3998FF", "color")} />
        )}
      </View>
      <Text style={lumoStyles.desktopHandle}>@{profile?.username ?? "user"}</Text>
      <Text style={lumoStyles.desktopIdentityTag}>{profileRoleLabel} ACCOUNT</Text>

      {!!profile?.bio && (
        <View style={lumoStyles.desktopBioArea}>
          <Text
            style={lumoStyles.desktopBio}
            numberOfLines={bioExpanded ? undefined : 5}
          >
            {profile.bio}
          </Text>
          {profile.bio.length > 90 && (
            <Pressable onPress={() => setBioExpanded(v => !v)} hitSlop={6}>
              <Text style={lumoStyles.bioToggleText}>
                {bioExpanded ? "Show less" : "Show more"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {!!(profile as any)?.website && (
        <Pressable
          style={lumoStyles.desktopWebsite}
          onPress={() => void Share.share({ message: (profile as any).website })}
        >
          <Ionicons name="arrow-up-right-box" size={16} color={C.lime} />
          <Text style={lumoStyles.websiteText} numberOfLines={1}>
            {(profile as any).website}
          </Text>
        </Pressable>
      )}

      <View style={lumoStyles.desktopNetworkCard}>
        <Text style={lumoStyles.desktopNetworkTitle}>Connections</Text>
        <View style={lumoStyles.desktopMetricsRow}>
          <Pressable
            style={lumoStyles.desktopMetric}
            onPress={() => void openConnections("followers")}
          >
            <Text style={lumoStyles.desktopMetricValue}>
              {formatNumber(followers)}
            </Text>
            <Text style={lumoStyles.desktopMetricLabel}>FOLLOWERS</Text>
          </Pressable>
          <View style={lumoStyles.desktopNetworkDivider} />
          <Pressable
            style={lumoStyles.desktopMetric}
            onPress={() => void openConnections("following")}
          >
            <Text style={lumoStyles.desktopMetricValue}>
              {formatNumber(following)}
            </Text>
            <Text style={lumoStyles.desktopMetricLabel}>FOLLOWING</Text>
          </Pressable>
        </View>
      </View>

      {isMe ? (
        <View style={lumoStyles.desktopOwnActions}>
          <Pressable
            style={[lumoStyles.desktopPrimaryAction, lumoStyles.desktopOwnPrimaryAction]}
            onPress={() => router.push("/edit-profile")}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={17} color={C.bg} />
            <Text style={lumoStyles.desktopPrimaryText}>CHANGE PROFILE</Text>
          </Pressable>
          <View style={lumoStyles.desktopActionSecondaryRow}>
            <Pressable
              style={lumoStyles.desktopSecondaryAction}
              onPress={() => router.push("/switch-profile")}
              accessibilityRole="button"
              accessibilityLabel="Switch profile"
            >
              <Ionicons name="repeat-outline" size={16} color={C.text} />
              <Text style={lumoStyles.desktopSecondaryText}>SWITCH PROFILE</Text>
            </Pressable>
            <Pressable
              style={lumoStyles.desktopIconAction}
              onPress={() => void Share.share({
                message: `Check out @${profile?.username ?? "user"} on Lumo!`,
              })}
              accessibilityRole="button"
              accessibilityLabel="Share profile"
            >
              <Ionicons name="share-outline" size={19} color={C.text} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={lumoStyles.desktopActions}>
          <Pressable
            style={[
              lumoStyles.desktopPrimaryAction,
              isFollowing && lumoStyles.desktopFollowingAction,
            ]}
            onPress={() => void toggleFollow()}
            disabled={followLoading}
          >
            {followLoading ? (
              <ActivityIndicator color={isFollowing ? C.lime : C.bg} size="small" />
            ) : (
              <Text style={[
                lumoStyles.desktopPrimaryText,
                isFollowing && lumoStyles.desktopFollowingText,
              ]}>
                {isFollowing ? "FOLLOWING" : "FOLLOW"}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={lumoStyles.desktopIconAction}
            onPress={() => router.push(`/chat/${userId}`)}
            accessibilityLabel="Message"
          >
            <Ionicons name="chatbubble-outline" size={18} color={C.text} />
          </Pressable>
          <Pressable
            style={lumoStyles.desktopIconAction}
            onPress={() => void Share.share({
              message: `Check out @${profile?.username ?? "user"} on Lumo!`,
            })}
            accessibilityLabel="Share profile"
          >
            <Ionicons name="share-outline" size={18} color={C.text} />
          </Pressable>
        </View>
      )}
      {canManageMemberRoles && !isMe && (
        <View style={lumoStyles.platformRolePanel}>
          <View style={lumoStyles.platformRoleInfo}>
            <Text style={lumoStyles.platformRoleEyebrow}>PLATFORM ACCESS</Text>
            <Text style={lumoStyles.platformRoleTitle}>
              {profileRoleLabel}
            </Text>
          </View>
          <Pressable
            style={[lumoStyles.platformRoleButton, targetIsAdmin && lumoStyles.platformRoleButtonRemove, roleSaving && lumoStyles.roleButtonDisabled]}
            onPress={() => void toggleAdminRole()}
            disabled={roleSaving}
          >
            {roleSaving ? <ActivityIndicator size="small" color={C.bg} /> : <Ionicons name={targetIsAdmin ? "remove-circle-outline" : "shield-checkmark-outline"} size={15} color={targetIsAdmin ? C.text : C.bg} />}
            <Text style={[lumoStyles.platformRoleButtonText, targetIsAdmin && lumoStyles.platformRoleButtonRemoveText]}>
              {roleSaving ? "SAVING..." : targetIsAdmin ? "REMOVE ADMIN" : "MAKE ADMIN"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const archiveHeader = (
    <View style={lumoStyles.desktopArchiveHeader}>
      <View style={lumoStyles.desktopArchiveHeading}>
        <View style={{ flex: 1 }}>
          <Text style={lumoStyles.desktopEyebrow}>PERSONAL SPACE / COLLECTION</Text>
          <Text style={lumoStyles.desktopArchiveTitle}>
            {activeTab === "posts"
              ? "Work archive"
              : activeTab === "reels"
                ? "Motion archive"
                : "Saved collection"}
          </Text>
          <Text style={lumoStyles.desktopArchiveSubtitle}>
            A record of everything you have shared.
          </Text>
        </View>
        <View style={lumoStyles.desktopArchiveCount}>
          <Text style={lumoStyles.desktopMetricLabel}>TOTAL ITEMS</Text>
          <Text style={lumoStyles.desktopArchiveCountValue}>
            {String(currentPosts.length).padStart(2, "0")}
          </Text>
        </View>
      </View>

      <View style={lumoStyles.desktopArchiveTabs}>
        <Pressable
          style={[lumoStyles.desktopArchiveTab, activeTab === "posts" && lumoStyles.desktopArchiveTabActive]}
          onPress={() => setActiveTab("posts")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "posts" }}
        >
          <Text style={[lumoStyles.desktopArchiveTabText, activeTab === "posts" && lumoStyles.desktopArchiveTabTextActive]}>
            WORK
          </Text>
        </Pressable>
        <Pressable
          style={[lumoStyles.desktopArchiveTab, activeTab === "reels" && lumoStyles.desktopArchiveTabActive]}
          onPress={() => setActiveTab("reels")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "reels" }}
        >
          <Text style={[lumoStyles.desktopArchiveTabText, activeTab === "reels" && lumoStyles.desktopArchiveTabTextActive]}>
            MOTION
          </Text>
        </Pressable>
        {isMe && (
          <Pressable
            style={[lumoStyles.desktopArchiveTab, activeTab === "saved" && lumoStyles.desktopArchiveTabActive]}
            onPress={() => setActiveTab("saved")}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "saved" }}
          >
            <Text style={[lumoStyles.desktopArchiveTabText, activeTab === "saved" && lumoStyles.desktopArchiveTabTextActive]}>
              SAVED
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
  const header = (
    <View style={lumoStyles.profileHeaderContainer}>
      {/* Top Bar: username with dropdown + hamburger menu */}
      <View style={lumoStyles.profileTopBar}>
        <View style={lumoStyles.usernameDropdown}>
          <Text style={lumoStyles.usernameText} numberOfLines={1}>
            {profile?.username ?? "user"}
          </Text>
          {isPremiumProfile && (
            <View style={lumoStyles.verifiedBadge}>
              <Ionicons name="checkmark" size={10} color={colors.inverseText} />
            </View>
          )}
          <Ionicons name="chevron-down" size={15} color={C.text} />
        </View>

        <Pressable
          style={lumoStyles.settingsMenuBtn}
          onPress={() => router.push("/settings")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings menu"
        >
          <Ionicons name="menu-outline" size={26} color={C.text} />
        </Pressable>
      </View>

      {/* Avatar & Stats */}
      <View style={lumoStyles.identityStatsRow}>
        <View style={[lumoStyles.avatarWrap, lumoStyles.avatarRing]}>
          <Avatar
            uri={profile?.avatar_url}
            name={profile?.username ?? ""}
            size={width >= 900 ? 96 : 76}
            hasStory={false}
          />
          {isMe && (
            <View style={lumoStyles.avatarAddBadge}>
              <Ionicons name="add" size={13} color={C.bg} />
            </View>
          )}
        </View>

        <View style={lumoStyles.statsRowNew}>
          <View style={lumoStyles.statBox}>
            <Text style={lumoStyles.statNumber}>{formatNumber(posts.length)}</Text>
            <Text style={lumoStyles.statLabelTitle}>Posts</Text>
          </View>
          <Pressable
            style={lumoStyles.statBox}
            onPress={() => void openConnections("followers")}
          >
            <Text style={lumoStyles.statNumber}>{formatNumber(followers)}</Text>
            <Text style={lumoStyles.statLabelTitle}>Followers</Text>
          </Pressable>
          <Pressable
            style={lumoStyles.statBox}
            onPress={() => void openConnections("following")}
          >
            <Text style={lumoStyles.statNumber}>{formatNumber(following)}</Text>
            <Text style={lumoStyles.statLabelTitle}>Following</Text>
          </Pressable>
        </View>
      </View>

      {/* Full Name & Bio */}
      <View style={lumoStyles.bioArea}>
        {!!profile?.full_name && (
          <Text style={lumoStyles.profileFullName}>{profile.full_name}</Text>
        )}
        {!!profile?.bio && (
          <>
            <Text
              style={lumoStyles.profileBioText}
              numberOfLines={bioExpanded ? undefined : 3}
            >
              {profile.bio}
            </Text>
            {profile.bio.length > 90 && (
              <Pressable
                onPress={() => setBioExpanded((value) => !value)}
                hitSlop={6}
              >
                <Text style={lumoStyles.bioToggleText}>
                  {bioExpanded ? "Show less" : "Show more"}
                </Text>
              </Pressable>
            )}
          </>
        )}
        {!!(profile as any)?.website && (
          <Pressable
            style={lumoStyles.websiteRow}
            onPress={() => {
              void Share.share({ message: (profile as any).website });
            }}
            hitSlop={6}
          >
            <Ionicons name="link-outline" size={13} color={C.lime} />
            <Text style={lumoStyles.websiteText} numberOfLines={1}>
              {(profile as any).website}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Action Buttons Row */}
      <View style={lumoStyles.actionButtonsRow}>
        {isMe ? (
          <>
            <Pressable
              style={lumoStyles.editBtn}
              onPress={() => router.push("/edit-profile")}
            >
              <Text style={lumoStyles.editBtnText}>Change Profile</Text>
            </Pressable>
            <Pressable
              style={lumoStyles.switchProfileBtn}
              onPress={() => router.push("/switch-profile")}
              accessibilityRole="button"
              accessibilityLabel="Switch profile"
            >
              <Ionicons name="repeat-outline" size={16} color={C.text} />
              <Text style={lumoStyles.switchProfileBtnText}>Switch Profile</Text>
            </Pressable>
            <Pressable
              style={lumoStyles.iconBtn}
              onPress={() => {
                void Share.share({
                  message: `Check out @${profile?.username ?? "user"} on Lumo!`,
                });
              }}
              hitSlop={6}
            >
              <Ionicons name="share-outline" size={18} color={C.text} />
            </Pressable>
          </>
        ) : (
          <>
            <Animated.View
              style={[{ flex: 1 }, { transform: [{ scale: primaryBtnScale }] }]}
            >
              <Pressable
                style={[lumoStyles.followBtn, isFollowing && lumoStyles.followingBtn]}
                onPress={() => void toggleFollow()}
                onPressIn={() => pressScale(primaryBtnScale, 0.96)}
                onPressOut={() => pressScale(primaryBtnScale, 1)}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator
                    color={isFollowing ? C.lime : C.bg}
                    size="small"
                  />
                ) : (
                  <Text
                    style={[
                      lumoStyles.followBtnText,
                      isFollowing && lumoStyles.followingBtnText,
                    ]}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
            <Pressable
              style={lumoStyles.messageBtn}
              onPress={() => router.push(`/chat/${userId}`)}
            >
              <Text style={lumoStyles.messageBtnText}>Message</Text>
            </Pressable>
            <Pressable
              style={lumoStyles.iconBtn}
              onPress={() => {
                void Share.share({
                  message: `Check out @${profile?.username ?? "user"} on Lumo!`,
                });
              }}
              hitSlop={6}
            >
              <Ionicons name="share-outline" size={18} color={C.text} />
            </Pressable>
          </>
        )}
      </View>

      {canManageMemberRoles && !isMe && (
        <View style={lumoStyles.platformRolePanel}>
          <View style={lumoStyles.platformRoleInfo}>
            <Text style={lumoStyles.platformRoleEyebrow}>PLATFORM ACCESS</Text>
            <Text style={lumoStyles.platformRoleTitle}>
              {profileRoleLabel}
            </Text>
          </View>
          <Pressable
            style={[lumoStyles.platformRoleButton, targetIsAdmin && lumoStyles.platformRoleButtonRemove, roleSaving && lumoStyles.roleButtonDisabled]}
            onPress={() => void toggleAdminRole()}
            disabled={roleSaving}
          >
            {roleSaving ? <ActivityIndicator size="small" color={C.bg} /> : <Ionicons name={targetIsAdmin ? "remove-circle-outline" : "shield-checkmark-outline"} size={15} color={targetIsAdmin ? C.text : C.bg} />}
            <Text style={[lumoStyles.platformRoleButtonText, targetIsAdmin && lumoStyles.platformRoleButtonRemoveText]}>
              {roleSaving ? "SAVING..." : targetIsAdmin ? "REMOVE ADMIN" : "MAKE ADMIN"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content Tabs (Grid, Videos/Reels, Saved) */}
      <View style={lumoStyles.contentTabsRow}>
        <Pressable
          style={[
            lumoStyles.contentTabItem,
            activeTab === "posts" && lumoStyles.contentTabItemActive,
          ]}
          onPress={() => setActiveTab("posts")}
        >
          <Ionicons
            name="grid"
            size={20}
            color={activeTab === "posts" ? C.lime : C.muted}
          />
        </Pressable>
        <Pressable
          style={[
            lumoStyles.contentTabItem,
            activeTab === "reels" && lumoStyles.contentTabItemActive,
          ]}
          onPress={() => setActiveTab("reels")}
        >
          <Ionicons
            name="play-circle-outline"
            size={22}
            color={activeTab === "reels" ? C.lime : C.muted}
          />
        </Pressable>
        {isMe && (
          <Pressable
            style={[
              lumoStyles.contentTabItem,
              activeTab === "saved" && lumoStyles.contentTabItemActive,
            ]}
            onPress={() => setActiveTab("saved")}
          >
            <View>
              <Ionicons
                name={activeTab === "saved" ? "bookmark" : "bookmark-outline"}
                size={20}
                color={activeTab === "saved" ? C.lime : C.muted}
              />
              {savedPosts.length > 0 && (
                <View style={lumoStyles.tabBadge}>
                  <Text style={lumoStyles.tabBadgeText}>
                    {savedPosts.length > 99 ? "99+" : savedPosts.length}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={lumoStyles.center}>
        <Image
          source={require("../assets/lumo-mark.png")}
          style={lumoStyles.loaderLogo}
          contentFit="contain"
        />

        <ActivityIndicator color={C.lime} size="small" />

        <Text style={lumoStyles.loadingText}>Opening profile space...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={lumoStyles.center}>
        <View style={lumoStyles.emptySymbol}>
          <Text style={lumoStyles.emptySymbolText}>↗</Text>
        </View>

        <Text style={lumoStyles.emptyTitle}>Profile unavailable</Text>

        <Text style={lumoStyles.emptyDescription}>
          {loadError || "This profile could not be found."}
        </Text>

        <Pressable style={lumoStyles.retryButton} onPress={() => void refresh()}>
          <Text style={lumoStyles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const renderPostRow = ({ item }: { item: PostRow }) => {
    return (
      <View style={lumoStyles.postPair}>
        {item.items.map((post, index) => (
          <Pressable
            key={post.id}
            onPress={() => void openPost(post)}
            style={[
              lumoStyles.smallPost,
              { width: tileWidth },
              index > 0 && lumoStyles.smallPostSecond,
            ]}
          >
            <Image
              source={post.image_url ? { uri: post.image_url } : null}
              style={[lumoStyles.smallPostImage, { aspectRatio: 1 }]}
              contentFit="cover"
              transition={180}
            />
            {activeTab === "reels" && (
              <View style={lumoStyles.reelsBadge}>
                <Ionicons name="play" size={12} color={colors.mediaText} />
              </View>
            )}
          </Pressable>
        ))}

        {item.items.length < 2 &&
          Array.from({ length: 2 - item.items.length }, (_, index) => (
            <View
              key={`empty-${item.id}-${index}`}
              style={{ width: tileWidth, marginLeft: 8 }}
            />
          ))}
      </View>
    );
  };

  const postMediaHeight = profileLayout.postMediaHeight;
  const mediaWidth = profileLayout.postMediaWidth;
  const selectedIsVideo = selectedPost?.media_type === "video" || Boolean(selectedPost?.video_url);

  const postOwnerContent = selectedPost ? (
    <View style={[lumoStyles.postOwner, lumoStyles.premiumPostOwner]}>
      <Avatar uri={profile.avatar_url} name={profile.username} size={44} />
      <View style={lumoStyles.postOwnerCopy}>
        <Text style={lumoStyles.ownerName}>@{profile.username}</Text>
        {!!profile.full_name && (
          <Text style={lumoStyles.ownerFullName}>{profile.full_name}</Text>
        )}
      </View>
      <View style={[lumoStyles.ownerBadge, lumoStyles.premiumOwnerBadge]}>
        <Text style={lumoStyles.ownerBadgeText}>CREATOR</Text>
      </View>
    </View>
  ) : null;

  const postMediaContent = selectedPost ? (
    selectedIsVideo ? (
      selectedPost.video_url ? (
        <View style={[lumoStyles.postMediaWrap, isWidePost ? lumoStyles.desktopPostMediaWrap : { width: mediaWidth }]}>
          <View
            style={[
              lumoStyles.postImageFrame,
              lumoStyles.premiumPostImageFrame,
              isWidePost && lumoStyles.desktopPostImageFrame,
              { height: postMediaHeight },
            ]}
          >
            <LumoVideoPlayer
              uri={selectedPost.video_url}
              analytics={{ ownerId: selectedPost.user_id, contentId: selectedPost.id, contentType: 'post' }}
              style={[lumoStyles.postVideoPlayer, { width: "100%", height: "100%" }]}
              bottomInset={10}
            />
          </View>
          <View style={lumoStyles.videoCornerLabel}>
            <Ionicons name="videocam" size={12} color={resolveThemeColor("#CBDD9B", "color")} />
            <Text style={lumoStyles.imageCornerLabelText}>LUMO MOTION</Text>
          </View>
          <Pressable
            style={lumoStyles.mediaExpandButton}
            onPress={openImageViewer}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open full-screen video"
          >
            <Ionicons name="expand-outline" size={19} color={C.text} />
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            lumoStyles.postMediaUnavailable,
            isWidePost && lumoStyles.desktopPostImageFrame,
            { width: mediaWidth, height: postMediaHeight },
          ]}
        >
          <Ionicons name="videocam-off-outline" size={32} color={C.muted} />
          <Text style={lumoStyles.postMediaUnavailableText}>Video unavailable</Text>
        </View>
      )
    ) : selectedPost.image_url ? (
      <View style={[lumoStyles.postMediaWrap, isWidePost ? lumoStyles.desktopPostMediaWrap : { width: mediaWidth }]}>
        <Pressable
          style={[
            lumoStyles.postImageFrame,
            lumoStyles.premiumPostImageFrame,
            isWidePost && lumoStyles.desktopPostImageFrame,
            { height: postMediaHeight },
          ]}
          onPress={handleImagePress}
        >
          <Image
            source={{ uri: selectedPost.image_url }}
            style={[lumoStyles.postImage, { width: "100%", height: "100%" }]}
            contentFit="contain"
            transition={180}
          />
          <View style={lumoStyles.imageCornerLabel}>
            <Text style={lumoStyles.imageCornerLabelText}>IMAGE</Text>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              lumoStyles.likeBurst,
              { opacity: heartOpacity, transform: [{ scale: heartScale }] },
            ]}
          >
            <LumoLikeIcon size={92} active color="#E7EDF4" />
          </Animated.View>
        </Pressable>
      </View>
    ) : (
      <View
        style={[
          lumoStyles.postMediaUnavailable,
          { width: mediaWidth, height: postMediaHeight },
          isWidePost && lumoStyles.desktopPostImageFrame,
        ]}
      >
        <Ionicons name="image-outline" size={32} color={C.muted} />
        <Text style={lumoStyles.postMediaUnavailableText}>Media unavailable</Text>
      </View>
    )
  ) : null;

  const postActionsContent = (
    <View style={[lumoStyles.postActions, lumoStyles.premiumPostActions, lumoStyles.postViewerActionsGrid]}>
      <Pressable
        style={[
          lumoStyles.postAction,
          lumoStyles.premiumPostAction,
          lumoStyles.postViewerActionCard,
          {
            backgroundColor: liked ? palette.dangerSoft : palette.surfaceRaised,
            borderWidth: 1,
            borderColor: liked ? palette.like : palette.border,
          },
        ]}
        onPress={() => void toggleLike()}
        disabled={likeLoading}
        accessibilityRole="button"
        accessibilityLabel={liked ? "Unlike post" : "Like post"}
      >
        <LumoLikeIcon size={23} active={liked} color={liked ? palette.like : palette.text} />
      </Pressable>
      <Pressable
        style={[
          lumoStyles.postAction,
          lumoStyles.premiumPostAction,
          lumoStyles.postViewerActionCard,
          { backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
        ]}
        onPress={() => setCommentsSheetVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={commentsCount > 0 ? `Open ${commentsCount} comments` : "Open comments"}
      >
        <Ionicons name="chatbubble-outline" size={20} color={palette.text} />
      </Pressable>
      <Pressable
        style={[
          lumoStyles.postAction,
          lumoStyles.premiumPostAction,
          lumoStyles.postViewerActionCard,
          { backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
        ]}
        onPress={sharePost}
        accessibilityRole="button"
        accessibilityLabel="Forward post"
      >
        <Ionicons name="arrow-redo-outline" size={21} color={palette.text} />
      </Pressable>
      <Pressable
        style={[
          lumoStyles.postAction,
          lumoStyles.premiumPostAction,
          lumoStyles.postViewerActionCard,
          lumoStyles.postViewerSaveAction,
          {
            backgroundColor: saved ? palette.accentSoft : palette.surfaceRaised,
            borderWidth: 1,
            borderColor: saved ? palette.accent : palette.border,
          },
        ]}
        onPress={() => void toggleSave()}
        disabled={saveLoading}
        accessibilityRole="button"
        accessibilityLabel={saved ? "Remove saved post" : "Save post"}
      >
        <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? palette.accentStrong : palette.text} />
      </Pressable>
    </View>
  );

  const postMetadataContent = (
    <>
      <Pressable onPress={() => void openLikers()} style={[lumoStyles.likeInfo, lumoStyles.premiumLikeInfo]}>
        <Text style={lumoStyles.likeInfoTitle}>
          {formatNumber(likesCount)} {likesCount === 1 ? "like" : "likes"}
        </Text>
        <Text style={lumoStyles.likeInfoAction}>VIEW LIKES ↗</Text>
      </Pressable>
      {!!selectedPost?.caption?.trim() && (
        <View style={[lumoStyles.postCaption, lumoStyles.premiumPostCaption]}>
          <Text style={lumoStyles.postCaptionLabel}>CAPTION</Text>
          <Text style={lumoStyles.postCaptionText}>{selectedPost.caption.trim()}</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={lumoStyles.screen}>
      {isDesktopProfile ? (
        <ScrollView
          style={lumoStyles.desktopPageScroll}
          contentContainerStyle={lumoStyles.desktopPageScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={palette.accent}
              colors={[palette.accent]}
              progressBackgroundColor={C.panel}
            />
          }
        >
          <View style={lumoStyles.desktopPageContentRow}>
            {identityPanel}

            <View style={lumoStyles.desktopArchiveFlow}>
              {archiveHeader}

              {postRows.length > 0 ? (
                postRows.map((item) => (
                  <React.Fragment key={item.id}>
                    {renderPostRow({ item })}
                  </React.Fragment>
                ))
              ) : (
                <View style={lumoStyles.emptyWorks}>
                  <View style={lumoStyles.emptyWorksIcon}>
                    <Text style={lumoStyles.emptyWorksIconText}>+</Text>
                  </View>
                  <Text style={lumoStyles.emptyWorksTitle}>A fresh canvas</Text>
                  <Text style={lumoStyles.emptyWorksText}>
                    {isMe
                      ? "Your first post will appear here when you share it."
                      : "There are no published works here yet."}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
        data={postRows}
        keyExtractor={(item) => item.id}
        renderItem={renderPostRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={lumoStyles.emptyWorks}>
            <View style={lumoStyles.emptyWorksIcon}>
              <Text style={lumoStyles.emptyWorksIconText}>＋</Text>
            </View>

            <Text style={lumoStyles.emptyWorksTitle}>A fresh canvas</Text>

            <Text style={lumoStyles.emptyWorksText}>
              {isMe
                ? "Your first post will appear here when you share it."
                : "There are no published works here yet."}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={palette.accent}
            colors={[palette.accent]}
            progressBackgroundColor={C.panel}
          />
        }
        contentContainerStyle={lumoStyles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
      )}
      <Modal
        visible={postVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closePost}
      >
        <KeyboardAvoidingView
          style={lumoStyles.modalScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[lumoStyles.modalHeader, lumoStyles.postViewerHeader]}>
            <View style={lumoStyles.postViewerHeaderLeft}>
              <Pressable
                onPress={closePost}
                hitSlop={10}
                style={[
                  lumoStyles.backButton,
                  lumoStyles.postViewerBackButton,
                  {
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: palette.surfaceRaised,
                    borderWidth: 1,
                    borderColor: palette.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close post"
              >
                <Ionicons name="close" size={21} color={palette.text} />
              </Pressable>
              <View style={lumoStyles.postViewerHeaderCopy}>
                <Text style={lumoStyles.postViewerOverline}>LUMO / PROFILE</Text>
                <Text style={lumoStyles.postViewerTitle}>
                  {selectedIsVideo ? "Video publication" : "Photo publication"}
                </Text>
              </View>
            </View>

            <View style={lumoStyles.postViewerHeaderRight}>
              {selectedPost?.user_id === me ? (
                <Pressable
                  onPress={requestDeleteSelectedPost}
                  disabled={postDeleteLoading}
                  style={lumoStyles.postDeleteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Delete post"
                >
                  {postDeleteLoading ? (
                    <ActivityIndicator size="small" color={palette.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={19} color={palette.danger} />
                  )}
                </Pressable>
              ) : (
                <View style={lumoStyles.postViewerHeaderMark}>
                  <Ionicons name="aperture-outline" size={19} color={palette.accent} />
                </View>
              )}
            </View>
          </View>

          {selectedPost ? (
            isWidePost ? (
              <View style={lumoStyles.postViewerWideLayout}>
                <View style={lumoStyles.postViewerMediaCard}>
                  <View style={lumoStyles.postViewerMediaHeading}>
                    <View style={lumoStyles.postViewerMediaHeadingCopy}>
                      <Text style={lumoStyles.postViewerSectionLabel}>ORIGINAL MEDIA</Text>
                      <Text style={lumoStyles.postViewerMediaTitle}>Your post, in full view</Text>
                    </View>
                    <View style={lumoStyles.postViewerTypeBadge}>
                      <Ionicons name={selectedIsVideo ? "videocam" : "image"} size={13} color={C.lime} />
                      <Text style={lumoStyles.postViewerTypeText}>{selectedIsVideo ? "VIDEO" : "PHOTO"}</Text>
                    </View>
                  </View>

                  <View style={[lumoStyles.postViewerMediaCanvas, { height: postMediaHeight }]}>
                    {postMediaContent}
                  </View>

                  <View style={lumoStyles.postViewerMediaFooter}>
                    <View style={lumoStyles.postViewerMediaFooterDot} />
                    <Text style={lumoStyles.postViewerMediaFooterText}>ORIGINAL QUALITY · FIT TO SCREEN</Text>
                  </View>
                </View>

                <View style={lumoStyles.postViewerDetailsCard}>
                  <View style={lumoStyles.postViewerDetailsTop}>
                    <Text style={lumoStyles.postViewerSectionLabel}>PUBLICATION DETAILS</Text>
                    <Text style={lumoStyles.postViewerDetailsHeading}>Post activity</Text>
                  </View>
                  <ScrollView
                    ref={postScrollRef}
                    style={lumoStyles.postViewerDetailsScroll}
                    contentContainerStyle={lumoStyles.postViewerDetailsContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={lumoStyles.postViewerOwnerBlock}>{postOwnerContent}</View>
                    {postActionsContent}
                    {postMetadataContent}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <ScrollView
                ref={postScrollRef}
                style={lumoStyles.postViewerCompactScroll}
                contentContainerStyle={lumoStyles.postViewerCompactScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={lumoStyles.postViewerCompactContent}>
                  <View style={lumoStyles.postViewerCompactOwner}>{postOwnerContent}</View>
                  <View style={lumoStyles.postViewerCompactMediaCard}>
                    <View style={lumoStyles.postViewerCompactMediaHeading}>
                      <Text style={lumoStyles.postViewerSectionLabel}>POST PREVIEW</Text>
                      <Text style={lumoStyles.postViewerTypeText}>{selectedIsVideo ? "VIDEO" : "PHOTO"}</Text>
                    </View>
                    {postMediaContent}
                  </View>
                  <View style={lumoStyles.postViewerCompactDetailsCard}>
                    {postActionsContent}
                    {postMetadataContent}
                  </View>
                </View>
              </ScrollView>
            )
          ) : null}

          {selectedPost && (
            <PostCommentsSheet
              embedded
              visible={commentsSheetVisible}
              postId={selectedPost.id}
              postOwnerId={profile?.id ?? userId}
              userId={me}
              onClose={() => setCommentsSheetVisible(false)}
              onCountChange={setCommentsCount}
            />
          )}

          {likersVisible && (
            <View style={lumoStyles.likersOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setLikersVisible(false)}
              />

              <View style={lumoStyles.likersSheet}>
                <View style={lumoStyles.sheetHandle} />

                <View style={lumoStyles.likersHeader}>
                  <View>
                    <Text style={lumoStyles.eyebrow}>COMMUNITY</Text>
                    <Text style={lumoStyles.likersTitle}>People who liked it</Text>
                  </View>

                  <Pressable
                    onPress={() => setLikersVisible(false)}
                    style={lumoStyles.sheetClose}
                  >
                    <Text style={lumoStyles.sheetCloseText}>×</Text>
                  </Pressable>
                </View>

                {likersLoading ? (
                  <View style={lumoStyles.sheetLoading}>
                    <ActivityIndicator color={palette.accent} />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {likers.map((liker) => (
                      <View key={liker.id} style={lumoStyles.personRow}>
                        <Avatar
                          uri={liker.avatar_url}
                          name={liker.username}
                          size={42}
                        />

                        <View style={lumoStyles.personCopy}>
                          <Text style={lumoStyles.personName}>
                            @{liker.username}
                          </Text>
                          <Text style={lumoStyles.personLabel}>LUMO MEMBER</Text>
                        </View>

                        <Text style={lumoStyles.personArrow}>↗</Text>
                      </View>
                    ))}

                    {!likersLoading && likers.length === 0 && (
                      <Text style={lumoStyles.sheetEmptyText}>No likes yet.</Text>
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={imageViewerVisible && Boolean(selectedPost?.image_url || selectedPost?.video_url)}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeImageViewer}
      >
        <View style={lumoStyles.imageViewerScreen}>
          {selectedIsVideo && selectedPost?.video_url ? (
            <LumoVideoPlayer
              uri={selectedPost.video_url}
              analytics={selectedPost ? { ownerId: selectedPost.user_id, contentId: selectedPost.id, contentType: 'post' } : undefined}
              style={{ width: "100%", height: Math.max(260, height - 88) }}
              topInset={66}
              bottomInset={24}
            />
          ) : selectedPost?.image_url ? (
            <View
              style={lumoStyles.imageViewerGestureArea}
              {...imageZoomResponder.panHandlers}
            >
              <Animated.View
                style={[
                  lumoStyles.imageViewerZoomLayer,
                  {
                    transform: [
                      { translateX: zoomTranslateX },
                      { translateY: zoomTranslateY },
                      { scale: zoomScale },
                    ],
                  },
                ]}
              >
                <Image
                  source={{ uri: selectedPost.image_url }}
                  style={lumoStyles.imageViewerImage}
                  contentFit="contain"
                  transition={180}
                />
              </Animated.View>
            </View>
          ) : null}

          <Text style={lumoStyles.imageViewerLabel}>{selectedIsVideo ? "VIDEO / ORIGINAL" : "PHOTO / ORIGINAL"}</Text>

          <Pressable
            style={lumoStyles.imageViewerClose}
            onPress={closeImageViewer}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close full-screen image"
          >
            <Ionicons name="close" size={24} color={C.text} />
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={connectionsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setConnectionsVisible(false)}
      >
        <View style={lumoStyles.connectionsOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setConnectionsVisible(false)}
          />

          <View style={lumoStyles.connectionsSheet}>
            <View style={lumoStyles.sheetHandle} />

            <View style={lumoStyles.connectionsHeader}>
              <View>
                <Text style={lumoStyles.eyebrow}>SOCIAL CIRCLE</Text>
                <Text style={lumoStyles.connectionsTitle}>
                  {connectionsMode === "followers" ? "Followers" : "Following"}
                </Text>
              </View>

              <Pressable
                onPress={() => setConnectionsVisible(false)}
                style={lumoStyles.sheetClose}
              >
                <Text style={lumoStyles.sheetCloseText}>×</Text>
              </Pressable>
            </View>

            {connectionsLoading ? (
              <View style={lumoStyles.sheetLoading}>
                <ActivityIndicator color={palette.accent} />
                <Text style={lumoStyles.commentsLoadingText}>
                  Finding people...
                </Text>
              </View>
            ) : connections.length === 0 ? (
              <View style={lumoStyles.sheetEmpty}>
                <Text style={lumoStyles.noCommentsMark}>✳</Text>
                <Text style={lumoStyles.noCommentsTitle}>Nothing here yet</Text>
              </View>
            ) : (
              <FlatList
                data={connections}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={lumoStyles.personRow}>
                    <Avatar
                      uri={item.avatar_url}
                      name={item.username}
                      size={42}
                    />

                    <View style={lumoStyles.personCopy}>
                      <Text style={lumoStyles.personName}>@{item.username}</Text>
                      <Text style={lumoStyles.personLabel}>LUMO MEMBER</Text>
                    </View>

                    <Text style={lumoStyles.personArrow}>↗</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={commentToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!commentDeleteLoading) setCommentToDelete(null);
        }}
      >
        <View style={lumoStyles.confirmOverlay}>
          <View style={lumoStyles.confirmDialog}>
            <Text style={lumoStyles.eyebrow}>CONFIRM ACTION</Text>
            <Text style={lumoStyles.confirmTitle}>Delete this comment?</Text>
            <Text style={lumoStyles.confirmMessage}>
              It will be removed immediately.
            </Text>

            <View style={lumoStyles.confirmActions}>
              <Pressable
                onPress={() => setCommentToDelete(null)}
                disabled={commentDeleteLoading}
                style={lumoStyles.confirmCancelButton}
              >
                <Text style={lumoStyles.confirmCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void confirmRemoveComment()}
                disabled={commentDeleteLoading}
                style={lumoStyles.confirmDeleteButton}
              >
                {commentDeleteLoading ? (
                  <ActivityIndicator color={C.bg} size="small" />
                ) : (
                  <Text style={lumoStyles.confirmDeleteText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <UniversalForwardModal visible={!!forwardSource} userId={me} source={forwardSource} onClose={() => setForwardSource(null)} onSuccess={() => setForwardSource(null)} />
    </View>
  );
}

function Stat({
  value,
  label,
  onPress,
  last = false,
}: {
  value: number;
  label: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const lumoStyles = useThemedStyles(styles);
  const content = (
    <>
      <Text style={lumoStyles.statValue}>{formatNumber(value)}</Text>
      <Text style={lumoStyles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={[lumoStyles.statCell, last && lumoStyles.statCellLast]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
        <Text style={lumoStyles.statHint}>VIEW ↗</Text>
      </Pressable>
    );
  }

  return (
    <View style={[lumoStyles.statCell, last && lumoStyles.statCellLast]}>
      {content}
      <Text style={lumoStyles.statHint}>COLLECTION</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumModalHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    borderBottomColor: C.border,
  },
  premiumBackButton: {
    borderRadius: 21,
    backgroundColor: "transparent",
  },
  premiumPostOwner: { paddingHorizontal: 16, paddingVertical: 10 },
  premiumOwnerBadge: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  premiumPostMediaWrap: {
    position: "relative",
  },
  postMediaWrap: {
    position: "relative",
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    overflow: "hidden",
  },
  premiumPostImageFrame: {
    width: "100%",
    marginHorizontal: 0,
    borderRadius: 18,
    backgroundColor: C.mediaBg,
  },
  mediaExpandButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,8,0.84)",
    borderWidth: 1,
    borderColor: "rgba(244,246,238,0.16)",
    zIndex: 3,
  },
  premiumPostActions: { gap: 2, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 },
  premiumPostAction: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 3,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: C.panel,
    borderColor: C.border,
  },
  premiumActionLabel: {
    fontSize: 10,
    letterSpacing: 0,
  },
  premiumLikeInfo: { paddingHorizontal: 16, paddingVertical: 8 },
  premiumPostCaption: {
    marginHorizontal: 18,
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  premiumCommentsSection: {
    paddingHorizontal: 18,
  },
  premiumCommentComposer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: C.bg,
  },
  premiumCommentInput: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: C.panel,
  },
  postCommentEntry: {
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 14,
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
  },
  postCommentEntryLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  postCommentEntryTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  postCommentEntryMeta: { color: C.muted, fontSize: 10, marginTop: 4 },
  desktopPostLayout: {
    flex: 1,
    width: "100%",
    maxWidth: 1560,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 24,
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  desktopPostMediaColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    justifyContent: "center",
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#0D100C",
  },
  desktopMediaHeading: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingBottom: 10,
  },
  desktopMediaEyebrow: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  desktopMediaTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginTop: 4,
  },
  desktopMediaTypeBadge: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
  },
  desktopMediaTypeText: {
    color: C.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  desktopPostMediaStage: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 17,
    backgroundColor: "#020302",
  },
  desktopPostMediaWrap: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  desktopPostImageFrame: {
    width: "100%",
    height: "100%",
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 17,
    backgroundColor: C.mediaBg,
  },
  desktopMediaFooter: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  desktopMediaFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.lime,
  },
  desktopMediaFooterText: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  desktopPostDetailsPanel: {
    width: "38%",
    minWidth: 320,
    maxWidth: 440,
    flexShrink: 0,
    minHeight: 0,
    alignSelf: "stretch",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
    overflow: "hidden",
    paddingTop: 15,
  },
  desktopDetailsHeading: {
    paddingHorizontal: 19,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  desktopDetailsEyebrow: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  desktopDetailsTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  desktopDetailsIndex: {
    width: 36,
    height: 36,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: C.lime,
    color: C.bg,
    fontSize: 17,
    fontWeight: "900",
    paddingTop: 7,
  },
  desktopPostDetailsScroll: {
    flex: 1,
    minHeight: 0,
  },
  desktopPostDetailsContent: {
    paddingBottom: 14,
  },
  desktopCommentEntry: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "#0D100C",
  },
  desktopCommentEntryIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.limeDark,
  },
  desktopCommentEntryCopy: {
    flex: 1,
    minWidth: 0,
  },
  desktopCommentEntryTitle: {
    color: C.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  desktopCommentEntrySubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },
  imageViewerScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.mediaBg,
  },
  imageViewerGestureArea: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageViewerZoomLayer: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerImage: {
    width: "100%",
    height: "100%",
  },
  imageViewerLabel: {
    position: "absolute",
    bottom: 28,
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  imageViewerClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,20,16,0.9)",
    borderWidth: 1,
    borderColor: C.border,
  },
  desktopPageScroll: {
    flex: 1,
    width: "100%",
  },
  desktopPageScrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  desktopPageContentRow: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
  },
  desktopArchiveFlow: {
    flex: 1,
    minWidth: 0,
  },
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: C.bg,
  },

  listContent: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: 44,
  },

  profileHeaderContainer: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 4,
  },
  profileTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 10,
  },
  usernameDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  usernameText: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  settingsMenuBtn: {
    padding: 4,
  },
  identityStatsRow: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  avatarWrap: {
    position: "relative",
  },
  statsRowNew: {
    flex: 1,
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statBox: {
    alignItems: "center",
    paddingHorizontal: 6,
  },
  statNumber: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  statLabelTitle: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: C.lime,
  },
  avatarAddBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.bg,
  },
  verifiedBadge: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#3998FF",
    alignItems: "center",
    justifyContent: "center",
  },
  bioToggleText: {
    color: C.lime,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  websiteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  websiteText: {
    color: C.lime,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  tabBadge: {
    position: "absolute",
    top: -6,
    right: -12,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    color: C.bg,
    fontSize: 9,
    fontWeight: "900",
  },
  likeBurst: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
  },
  heartBurstIcon: {
    fontSize: 90,
    color: "rgba(255,255,255,0.92)",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 14,
  },
  bioArea: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    marginTop: 14,
    gap: 4,
  },
  profileFullName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
  },
  profileBioText: {
    color: "#D1D5CB",
    fontSize: 13,
    lineHeight: 19,
  },
  actionButtonsRow: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  editBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
  },
  switchProfileBtn: {
    flex: 1,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },
  switchProfileBtnText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
  },
  followBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  followingBtn: {
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },
  followBtnText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: "800",
  },
  followingBtnText: {
    color: C.text,
    fontWeight: "700",
  },
  messageBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBtnText: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  contentTabsRow: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 18,
    paddingTop: 4,
  },
  contentTabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  contentTabItemActive: {
    borderBottomColor: C.lime,
  },
  gridRow: {
    flexDirection: "row",
    marginBottom: 2,
    gap: 2,
  },
  gridTile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: C.panel2,
    position: "relative",
  },
  gridTileImage: {
    width: "100%",
    height: "100%",
  },
  gridTileEmpty: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: "transparent",
  },
  reelsBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageHeader: {
    paddingTop: 8,
    paddingBottom: 4,
  },

  center: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  loaderLogo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    marginBottom: 24,
  },

  loadingText: {
    color: C.muted,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 14,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 24,
    minHeight: 32,
  },

  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    marginRight: 9,
  },

  brandName: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
  },

  topPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginLeft: "auto",
    gap: 6,
  },

  topPillText: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "800",
    color: C.muted,
  },

  settingsArrow: {
    color: C.lime,
    fontSize: 13,
    fontWeight: "900",
  },

  heroCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    padding: 18,
  },

  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },

  eyebrow: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
  },

  heroIndex: {
    color: C.lime,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  avatarFrame: {
    width: 98,
    height: 98,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: "#424A35",
  },

  avatarStatus: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.lime,
    borderWidth: 3,
    borderColor: C.panel,
  },

  identityCopy: {
    flex: 1,
    minWidth: 0,
  },

  handle: {
    color: C.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
    letterSpacing: -0.7,
  },

  fullName: {
    marginTop: 5,
    color: "#C1C7B9",
    fontSize: 13,
  },

  accountType: {
    color: C.lime,
    marginTop: 10,
    fontSize: 9,
    letterSpacing: 1.05,
    fontWeight: "800",
  },

  bioBlock: {
    marginTop: 24,
    flexDirection: "row",
    gap: 12,
  },

  bioAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: C.lime,
  },

  bio: {
    flex: 1,
    color: "#D1D5CB",
    fontSize: 13,
    lineHeight: 21,
  },

  heroDivider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: 24,
    marginBottom: 4,
  },

  statsRow: {
    flexDirection: "row",
    paddingVertical: 17,
  },

  statCell: {
    flex: 1,
    paddingLeft: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },

  statCellLast: {
    borderRightWidth: 0,
  },

  statValue: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  statLabelAlt: {
    marginTop: 5,
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  statHint: {
    marginTop: 8,
    color: "#697161",
    fontSize: 8,
    letterSpacing: 0.4,
  },

  buttons: {
    flexDirection: "row",
    gap: 9,
    marginTop: 7,
  },

  primaryButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: C.lime,
    paddingHorizontal: 15,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },

  primaryButtonText: {
    color: C.bg,
    fontSize: 12,
    fontWeight: "900",
  },

  primaryButtonArrow: {
    color: C.bg,
    fontSize: 18,
    fontWeight: "800",
  },

  followingButton: {
    backgroundColor: C.limeDark,
    borderWidth: 1,
    borderColor: "#434D31",
  },

  followingButtonText: {
    color: C.lime,
  },

  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: 15,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },

  secondaryButtonText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
  },

  postPair: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 11,
  },

  smallPost: {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: "100%",
    backgroundColor: C.panel,
    borderRadius: 13,
    padding: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },

  smallPostSecond: {
    marginLeft: 8,
  },

  smallPostImage: {
    width: "100%",
    borderRadius: 9,
    backgroundColor: C.panel2,
  },

  smallPostFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 7,
  },

  smallPostIndex: {
    color: C.muted,
    fontSize: 7,
    letterSpacing: 0.5,
    fontWeight: "800",
  },

  smallPostArrow: {
    color: C.lime,
    fontSize: 15,
    fontWeight: "800",
  },

  emptyWorks: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 46,
    borderRadius: 22,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },

  emptyWorksIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: C.limeDark,
    marginBottom: 17,
  },

  emptyWorksIconText: {
    color: C.lime,
    fontSize: 27,
    fontWeight: "500",
  },

  emptyWorksTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
  },

  emptyWorksText: {
    maxWidth: 260,
    textAlign: "center",
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },

  emptySymbol: {
    width: 65,
    height: 65,
    borderRadius: 22,
    backgroundColor: C.limeDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  emptySymbolText: {
    color: C.lime,
    fontSize: 30,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "900",
  },

  emptyDescription: {
    marginTop: 10,
    color: C.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 21,
  },

  retryButton: {
    marginTop: 24,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },

  retryButtonText: {
    color: C.bg,
    fontWeight: "900",
  },

  modalScreen: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: "#080B11",
  },

  modalHeader: {
    minHeight: 76,
    width: "100%",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },

  backButtonText: {
    color: C.text,
    fontSize: 25,
  },

  modalHeaderCenter: {
    alignItems: "center",
  },

  modalOverline: {
    color: C.muted,
    fontSize: 8,
    letterSpacing: 1.4,
    fontWeight: "800",
  },

  modalTitle: {
    color: C.text,
    fontSize: 15,
    marginTop: 4,
    fontWeight: "900",
  },

  modalHeaderIndex: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
    borderRadius: 13,
  },

  modalHeaderIndexText: {
    color: C.bg,
    fontWeight: "900",
    fontSize: 18,
  },

  postDeleteButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#1B1418",
    borderWidth: 1,
    borderColor: "rgba(255,100,120,0.32)",
  },

  postViewerHeader: {
    height: Platform.OS === "android" ? 100 : 76,
    minHeight: Platform.OS === "android" ? 100 : 76,
    width: "100%",
    flexShrink: 0,
    paddingTop: Platform.OS === "android" ? 24 : 0,
    paddingHorizontal: 22,
    backgroundColor: "#0B1018",
    borderBottomColor: "rgba(176,190,208,0.12)",
  },
  postViewerHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  postViewerBackButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#151D28",
    borderColor: "rgba(176,190,208,0.16)",
  },
  postViewerHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  postViewerOverline: {
    color: "#8998AA",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  postViewerTitle: {
    color: "#F2F5F9",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  postViewerHeaderRight: {
    minWidth: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  postViewerHeaderMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151D28",
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.14)",
  },
  postViewerWideLayout: {
    flex: 1,
    width: "100%",
    maxWidth: 1440,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  postViewerMediaCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.15)",
    backgroundColor: "#0C121B",
  },
  postViewerMediaHeading: {
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  postViewerMediaHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  postViewerSectionLabel: {
    color: "#8B9AAD",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.35,
  },
  postViewerMediaTitle: {
    color: "#EFF3F8",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.15,
  },
  postViewerTypeBadge: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: "#182230",
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.14)",
  },
  postViewerTypeText: {
    color: "#C6D1DE",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  postViewerMediaCanvas: {
    width: "100%",
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 12,
    backgroundColor: "#05080D",
  },
  postViewerMediaFooter: {
    height: 36,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(176,190,208,0.10)",
  },
  postViewerMediaFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.lime,
  },
  postViewerMediaFooterText: {
    color: "#8392A4",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.05,
  },
  postViewerDetailsCard: {
    width: "36%",
    minWidth: 320,
    maxWidth: 420,
    flexShrink: 0,
    flexGrow: 0,
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.15)",
    backgroundColor: "#111925",
  },
  postViewerDetailsTop: {
    paddingHorizontal: 18,
    paddingTop: 19,
    paddingBottom: 12,
    gap: 5,
  },
  postViewerDetailsHeading: {
    color: "#F0F4F8",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  postViewerDetailsScroll: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  postViewerDetailsContent: {
    paddingBottom: 16,
  },
  postViewerOwnerBlock: {
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 3,
    borderRadius: 16,
    backgroundColor: "#182230",
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.10)",
    overflow: "hidden",
  },
  postViewerActionsGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 18,
    paddingHorizontal: 17,
    paddingTop: 3,
    paddingBottom: 3,
  },
  postViewerActionCard: {
    flex: 0,
    width: 42,
    minWidth: 42,
    minHeight: 42,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 21,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
  },
  postViewerSaveAction: {
    marginLeft: "auto",
  },
  postViewerCompactScroll: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    minHeight: 0,
  },
  postViewerCompactScrollContent: {
    flexGrow: 1,
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  postViewerCompactContent: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
    gap: 14,
    paddingBottom: 28,
  },
  postViewerCompactOwner: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.14)",
    backgroundColor: "#111925",
  },
  postViewerCompactMediaCard: {
    width: "100%",
    padding: 14,
    alignItems: "center",
    overflow: "hidden",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.15)",
    backgroundColor: "#0C121B",
  },
  postViewerCompactMediaHeading: {
    width: "100%",
    minHeight: 31,
    paddingHorizontal: 5,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  postViewerCompactDetailsCard: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(176,190,208,0.15)",
    backgroundColor: "#111925",
  },

  postScroll: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    minHeight: 0,
  },

  postScrollContent: {
    width: "100%",
    minWidth: 0,
    alignItems: "stretch",
    paddingBottom: 24,
  },

  postOwner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },

  postOwnerCopy: {
    flex: 1,
  },

  ownerName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },

  ownerFullName: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },

  ownerBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: C.limeDark,
  },

  ownerBadgeText: {
    color: C.lime,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  postImageFrame: {
    width: "100%",
    marginHorizontal: 0,
    alignSelf: "stretch",
    backgroundColor: C.mediaBg,
    borderRadius: 21,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  postImage: {
    height: 260,
    backgroundColor: C.mediaBg,
  },

  imageCornerLabel: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(8,10,8,0.86)",
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },

  imageCornerLabelText: {
    color: C.text,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },

  postActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 7,
  },

  postAction: {
    flex: 1,
    minHeight: 66,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#121611",
    borderWidth: 1,
    borderColor: "#2B3328",
  },

  postActionForward: {
    backgroundColor: "#171E13",
    borderColor: "#3B492F",
  },

  postActionLikeActive: {
    backgroundColor: "#1A222C",
    borderColor: "#3A4A5D",
  },

  postActionSaveActive: {
    backgroundColor: "#252013",
    borderColor: "#5A4C2B",
  },

  postActionLabel: {
    color: "#AEB6A8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.45,
  },

  postActionLabelForward: {
    color: "#CBDD9B",
  },

  postActionLabelLikeActive: {
    color: "#FF8997",
  },

  postActionLabelSaveActive: {
    color: "#E6C77D",
  },

  likeInfo: {
    paddingHorizontal: 17,
    paddingVertical: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  likeInfoTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  likeInfoAction: {
    color: C.lime,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  postVideoPlayer: {
    height: 260,
    borderRadius: 20,
  },

  videoCornerLabel: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(8,10,8,0.9)",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  postMediaUnavailable: {
    height: 320,
    marginHorizontal: 0,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#30372C",
    backgroundColor: "#12161C",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  postMediaUnavailableText: {
    color: "#9AA5B2",
    fontSize: 12,
    fontWeight: "700",
  },

  postCaption: {
    marginHorizontal: 16,
    marginTop: 5,
    marginBottom: 17,
    padding: 16,
    borderRadius: 15,
    backgroundColor: "#111510",
    borderWidth: 1,
    borderColor: "#283126",
    gap: 9,
  },

  postCaptionLabel: {
    color: "#A9BC83",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  postCaptionText: {
    color: "#E8ECE4",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 22,
  },
  commentsSection: {
    marginTop: 3,
    paddingHorizontal: 16,
  },

  commentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 18,
    paddingBottom: 15,
  },

  commentsTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },

  commentCountPill: {
    minWidth: 35,
    height: 35,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },

  commentCountText: {
    color: C.lime,
    fontWeight: "900",
    fontSize: 12,
  },

  commentsLoading: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },

  commentsLoadingText: {
    color: C.muted,
    fontSize: 11,
  },

  noCommentsCard: {
    paddingVertical: 25,
    paddingHorizontal: 20,
    borderRadius: 17,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },

  noCommentsMark: {
    color: C.lime,
    fontSize: 25,
    marginBottom: 9,
  },

  noCommentsTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },

  noCommentsText: {
    color: C.muted,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 6,
  },

  commentRow: {
    flexDirection: "row",
    gap: 11,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  commentRowLast: {
    borderBottomWidth: 0,
  },

  commentDeletePill: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 100, 120, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 100, 120, 0.35)",
  },

  commentDeleteText: {
    color: "#ff9ca9",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  commentBody: {
    flex: 1,
    minWidth: 0,
  },

  commentUserLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 6,
  },

  commentUsername: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
  },

  commentTimestamp: {
    color: "#697161",
    fontSize: 9,
  },

  commentContent: {
    color: "#D0D5CA",
    fontSize: 13,
    lineHeight: 20,
  },

  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 25 : 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },

  composerAccent: {
    width: 3,
    height: 30,
    borderRadius: 2,
    backgroundColor: C.lime,
  },

  commentInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 44,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 10,
    color: C.text,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    fontSize: 12,
  },

  sendCommentButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.lime,
  },

  sendCommentDisabled: {
    opacity: 0.4,
  },

  sendCommentText: {
    color: C.bg,
    fontSize: 24,
    fontWeight: "900",
  },

  likersOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.overlay,
    justifyContent: "flex-end",
  },

  likersSheet: {
    maxHeight: "72%",
    minHeight: 250,
    paddingHorizontal: 19,
    paddingBottom: 22,
    backgroundColor: C.panel,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
  },

  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#41483B",
    marginTop: 10,
    marginBottom: 7,
  },

  likersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },

  likersTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 5,
  },

  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },

  sheetCloseText: {
    color: C.text,
    fontSize: 23,
  },

  sheetLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  personCopy: {
    flex: 1,
  },

  personName: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  personLabel: {
    color: C.muted,
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 5,
  },

  personArrow: {
    color: C.lime,
    fontSize: 19,
    paddingHorizontal: 5,
  },

  sheetEmptyText: {
    color: C.muted,
    textAlign: "center",
    paddingVertical: 30,
    fontSize: 12,
  },

  connectionsOverlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "flex-end",
  },

  connectionsSheet: {
    height: "72%",
    paddingHorizontal: 19,
    paddingBottom: 20,
    backgroundColor: C.panel,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
  },

  connectionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },

  connectionsTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 5,
  },

  sheetEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  confirmOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: C.overlay,
  },

  confirmDialog: {
    width: "100%",
    maxWidth: 380,
    padding: 22,
    borderRadius: 20,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },

  confirmTitle: {
    marginTop: 12,
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
  },

  confirmMessage: {
    marginTop: 8,
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
  },

  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },

  confirmCancelButton: {
    minWidth: 88,
    minHeight: 42,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel2,
  },

  confirmCancelText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
  },

  confirmDeleteButton: {
    minWidth: 88,
    minHeight: 42,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: C.lime,
  },

  confirmDeleteText: {
    color: C.bg,
    fontSize: 12,
    fontWeight: "900",
  },
  desktopIdentityScroll: {
    width: 320,
    flexShrink: 0,
    height: "100%",
    maxHeight: "100%",
  },
  desktopIdentityScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  desktopLayout: {
    height: "100%",
    minHeight: 0,
    flex: 1,
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  desktopIdentityPanel: {
    width: 320,
    flexShrink: 0,
    alignSelf: "flex-start",
    padding: 22,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
  },
  desktopPanelTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  desktopPanelHeading: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  desktopEyebrow: {
    color: C.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  desktopSettingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopAvatarFrame: {
    width: 104,
    height: 104,
    borderRadius: 26,
    padding: 4,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
    position: "relative",
  },
  desktopNameRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  desktopFullName: {
    maxWidth: "92%",
    color: C.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    textAlign: "center",
    flexShrink: 1,
  },
  desktopHandle: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  desktopIdentityTag: {
    color: C.lime,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 10,
    textAlign: "center",
  },
  desktopBioArea: {
    marginTop: 20,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  desktopBio: {
    color: "#D1D5CB",
    fontSize: 14,
    lineHeight: 22,
  },
  desktopWebsite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  desktopNetworkCard: {
    marginTop: 22,
    paddingVertical: 15,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  desktopNetworkTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
  },
  desktopMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },
  desktopMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 5,
  },
  desktopMetricValue: {
    color: C.text,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  desktopMetricLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  desktopNetworkDivider: {
    width: 1,
    height: 38,
    backgroundColor: C.border,
    marginHorizontal: 14,
  },
  desktopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  desktopOwnActions: {
    flexDirection: "column",
    gap: 9,
    marginTop: 20,
  },
  desktopActionSecondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  desktopOwnPrimaryAction: {
    flex: 0,
    width: "100%",
    height: 46,
  },
  desktopPrimaryAction: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  desktopPrimaryText: {
    color: C.bg,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  desktopSecondaryAction: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  desktopSecondaryText: {
    color: C.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.45,
  },
  desktopFollowingAction: {
    backgroundColor: C.limeDark,
    borderWidth: 1,
    borderColor: "#434D31",
  },
  desktopFollowingText: {
    color: C.lime,
  },
  desktopIconAction: {
    width: 46,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
  },
  desktopArchivePanel: {
    height: "100%",
    minHeight: 0,
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  desktopArchiveList: {
    height: "100%",
    minHeight: 0,
    flex: 1,

  },
  desktopListContent: {
    width: "100%",
    paddingBottom: 48,
  },
  desktopArchiveHeader: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  desktopArchiveHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingBottom: 24,
  },
  desktopArchiveTitle: {
    color: C.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 10,
  },
  desktopArchiveSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 8,
  },
  desktopArchiveCount: {
    minWidth: 88,
    padding: 13,
    backgroundColor: C.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  desktopArchiveCountValue: {
    color: C.lime,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 5,
    fontVariant: ["tabular-nums"],
  },
  desktopArchiveTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  desktopArchiveTab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "transparent",
  },
  desktopArchiveTabActive: {
    backgroundColor: C.panel2,
    borderColor: C.border,
  },
  desktopArchiveTabText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  desktopArchiveTabTextActive: {
    color: C.lime,
  },
  platformRolePanel: {
    marginTop: 15,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  platformRoleInfo: { flex: 1, gap: 4 },
  platformRoleEyebrow: { color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 },
  platformRoleTitle: { color: C.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.6 },
  platformRoleButton: { minHeight: 37, paddingHorizontal: 11, borderRadius: 9, backgroundColor: C.lime, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  platformRoleButtonRemove: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border },
  platformRoleButtonText: { color: C.bg, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  platformRoleButtonRemoveText: { color: C.text },
  roleButtonDisabled: { opacity: 0.55 },
});
