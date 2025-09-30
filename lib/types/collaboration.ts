export type PresenceStatus = 'online' | 'away' | 'offline';

export interface UserPresence {
  id: string;
  userId: string;
  projectId: string;
  status: PresenceStatus;
  lastSeen: Date;
  cursorPosition?: CursorPosition;
  currentPage?: string;
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CursorPosition {
  x: number;
  y: number;
  elementId?: string;
  textOffset?: number;
  timestamp: number;
}

export interface Collaborator {
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  status: PresenceStatus;
  lastSeen: Date;
  cursorPosition?: CursorPosition;
  currentPage?: string;
  sessionId: string;
}

export interface Comment {
  id: string;
  projectId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  contentHtml?: string;
  mentions: CommentMention[];
  position?: CommentPosition;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  replyCount: number;
  replies?: Comment[];
}

export interface CommentMention {
  userId: string;
  userName: string;
  startIndex: number;
  length: number;
}

export interface CommentPosition {
  elementId: string;
  x: number;
  y: number;
  context?: string;
}

export interface CreateCommentRequest {
  projectId: string;
  parentId?: string;
  content: string;
  mentions?: CommentMention[];
  position?: CommentPosition;
}

export interface UpdateCommentRequest {
  content?: string;
  mentions?: CommentMention[];
  resolved?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content?: string;
  data: Record<string, any>;
  read: boolean;
  readAt?: Date;
  projectId?: string;
  commentId?: string;
  mentionedBy?: string;
  createdAt: Date;
}

export type NotificationType =
  | 'comment_mention'
  | 'comment_reply'
  | 'project_invite'
  | 'project_update'
  | 'presence_joined'
  | 'presence_left';

export interface ActivityEvent {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: string;
  description: string;
  metadata: Record<string, any>;
  collaboratorId?: string;
  commentId?: string;
  presenceData?: Record<string, any>;
  createdAt: Date;
}

export interface ActivityFilter {
  userId?: string;
  action?: string;
  collaboratorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  includePresence?: boolean;
}

export interface RealTimeEvent {
  type: RealTimeEventType;
  projectId: string;
  userId: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

export type RealTimeEventType =
  | 'presence_update'
  | 'presence_join'
  | 'presence_leave'
  | 'cursor_move'
  | 'comment_create'
  | 'comment_update'
  | 'comment_delete'
  | 'comment_resolve'
  | 'notification_create'
  | 'activity_create';

export interface WebSocketMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

export interface PresenceUpdateData {
  status: PresenceStatus;
  cursorPosition?: CursorPosition;
  currentPage?: string;
}

export interface CursorMoveData {
  position: CursorPosition;
  currentPage: string;
}

export interface CommentCreateData {
  comment: Comment;
  mentions: CommentMention[];
}

export interface CommentUpdateData {
  commentId: string;
  updates: Partial<Comment>;
}

export interface CommentResolveData {
  commentId: string;
  resolved: boolean;
  resolvedBy: string;
}

export interface NotificationCreateData {
  notification: Notification;
}

export interface ActivityCreateData {
  activity: ActivityEvent;
}

export interface CollaborationRoom {
  projectId: string;
  participants: Map<string, Collaborator>;
  comments: Map<string, Comment>;
  lastActivity: Date;
}

export interface CollaborationState {
  currentProject?: string;
  presence: UserPresence[];
  collaborators: Collaborator[];
  comments: Comment[];
  notifications: Notification[];
  activities: ActivityEvent[];
  isConnected: boolean;
  sessionId: string;
}

export interface MentionSuggestion {
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  isOnline: boolean;
}

export interface CommentThread {
  rootComment: Comment;
  replies: Comment[];
  totalReplies: number;
  unresolvedCount: number;
}

export interface PresenceConfig {
  heartbeatInterval: number;
  offlineThreshold: number;
  cleanupInterval: number;
  maxCursorHistory: number;
}

export interface NotificationPreferences {
  commentMentions: boolean;
  commentReplies: boolean;
  projectInvites: boolean;
  projectUpdates: boolean;
  presenceEvents: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  heartbeatInterval: 30000, // 30 seconds
  offlineThreshold: 300000, // 5 minutes
  cleanupInterval: 3600000, // 1 hour
  maxCursorHistory: 100
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  commentMentions: true,
  commentReplies: true,
  projectInvites: true,
  projectUpdates: true,
  presenceEvents: false,
  emailNotifications: true,
  pushNotifications: true
};