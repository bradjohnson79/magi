import React, { useState, useRef, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Comment, CreateCommentRequest, Collaborator } from '@/lib/types/collaboration';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import {
  MessageSquare,
  Reply,
  Check,
  X,
  MoreHorizontal,
  Edit2,
  Trash2,
  AtSign,
  Send
} from 'lucide-react';

interface CommentSidebarProps {
  comments: Comment[];
  collaborators: Collaborator[];
  currentUserId: string;
  projectId: string;
  onCreateComment: (data: CreateCommentRequest) => Promise<void>;
  onUpdateComment: (commentId: string, updates: any) => Promise<void>;
  onResolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  className?: string;
}

interface CommentFormProps {
  onSubmit: (content: string, parentId?: string) => Promise<void>;
  collaborators: Collaborator[];
  placeholder?: string;
  parentId?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

function CommentForm({
  onSubmit,
  collaborators,
  placeholder = "Add a comment...",
  parentId,
  autoFocus = false,
  onCancel
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setLoading(true);
    try {
      await onSubmit(content, parentId);
      setContent('');
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }

    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }

    // Handle @ mentions
    if (e.key === '@' || (e.key === '2' && e.shiftKey)) {
      setShowMentions(true);
      setMentionQuery('');
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart;

    setContent(value);
    setCursorPosition(position);

    // Check if we're typing after an @
    const textBeforeCursor = value.substring(0, position);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1]);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (collaborator: Collaborator) => {
    const textBeforeCursor = content.substring(0, cursorPosition);
    const textAfterCursor = content.substring(cursorPosition);

    // Remove the partial @ mention
    const beforeMention = textBeforeCursor.replace(/@\w*$/, '');
    const mentionText = `@[${collaborator.userName}](${collaborator.userId})`;

    const newContent = beforeMention + mentionText + ' ' + textAfterCursor;
    setContent(newContent);
    setShowMentions(false);

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + mentionText.length + 1;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const filteredCollaborators = collaborators.filter(collaborator =>
    collaborator.userName.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="resize-none"
        />

        {showMentions && filteredCollaborators.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filteredCollaborators.map(collaborator => (
              <div
                key={collaborator.userId}
                className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer"
                onClick={() => insertMention(collaborator)}
              >
                <Avatar className="h-6 w-6">
                  {collaborator.avatarUrl && (
                    <img src={collaborator.avatarUrl} alt={collaborator.userName} />
                  )}
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{collaborator.userName}</p>
                  <p className="text-xs text-muted-foreground">{collaborator.userEmail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Tip: Use @ to mention collaborators, Cmd+Enter to send
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!content.trim() || loading}
          >
            <Send className="h-4 w-4 mr-1" />
            {loading ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CommentItemProps {
  comment: Comment;
  replies: Comment[];
  currentUserId: string;
  collaborators: Collaborator[];
  onReply: (content: string, parentId: string) => Promise<void>;
  onUpdate: (commentId: string, updates: any) => Promise<void>;
  onResolve: (commentId: string, resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  level?: number;
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  collaborators,
  onReply,
  onUpdate,
  onResolve,
  onDelete,
  level = 0
}: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const isAuthor = comment.authorId === currentUserId;
  const canEdit = isAuthor;
  const canDelete = isAuthor;

  const handleReply = async (content: string) => {
    await onReply(content, comment.id);
    setShowReplyForm(false);
  };

  const handleEdit = async () => {
    if (editContent.trim() !== comment.content) {
      await onUpdate(comment.id, { content: editContent });
    }
    setEditing(false);
  };

  const renderCommentContent = (content: string) => {
    // Simple mention rendering - in a real app you'd want more sophisticated parsing
    return content.replace(
      /@\[([^\]]+)\]\(([^)]+)\)/g,
      '<span class="text-blue-600 font-medium">@$1</span>'
    );
  };

  return (
    <div className={`space-y-3 ${level > 0 ? 'ml-6 pl-4 border-l-2 border-muted' : ''}`}>
      <div className="group">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 mt-1">
            {comment.authorAvatar && (
              <img src={comment.authorAvatar} alt={comment.authorName} />
            )}
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{comment.authorName}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
              </span>
              {comment.resolved && (
                <Badge variant="secondary" className="text-xs">
                  Resolved
                </Badge>
              )}
            </div>

            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleEdit}>
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
                      setEditContent(comment.content);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: renderCommentContent(comment.content)
                }}
              />
            )}

            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                <Reply className="h-3 w-3 mr-1" />
                Reply
              </Button>

              {!comment.resolved && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResolve(comment.id, true)}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Resolve
                </Button>
              )}

              {comment.resolved && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResolve(comment.id, false)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Unresolve
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => setEditing(true)}
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:text-red-700"
                        onClick={() => onDelete(comment.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {showReplyForm && (
          <div className="mt-3 ml-11">
            <CommentForm
              onSubmit={handleReply}
              collaborators={collaborators}
              placeholder="Reply to this comment..."
              parentId={comment.id}
              autoFocus
              onCancel={() => setShowReplyForm(false)}
            />
          </div>
        )}
      </div>

      {/* Render replies */}
      {replies.length > 0 && (
        <div className="space-y-3">
          {replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]} // Replies to replies would be fetched separately
              currentUserId={currentUserId}
              collaborators={collaborators}
              onReply={onReply}
              onUpdate={onUpdate}
              onResolve={onResolve}
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentSidebar({
  comments,
  collaborators,
  currentUserId,
  projectId,
  onCreateComment,
  onUpdateComment,
  onResolveComment,
  onDeleteComment,
  className = ''
}: CommentSidebarProps) {
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');

  // Organize comments into threads
  const commentThreads = React.useMemo(() => {
    const rootComments = comments.filter(c => !c.parentId);
    const threads = rootComments.map(root => ({
      root,
      replies: comments.filter(c => c.parentId === root.id)
    }));

    // Apply filter
    return threads.filter(thread => {
      switch (filter) {
        case 'unresolved':
          return !thread.root.resolved || thread.replies.some(r => !r.resolved);
        case 'resolved':
          return thread.root.resolved && thread.replies.every(r => r.resolved);
        default:
          return true;
      }
    });
  }, [comments, filter]);

  const handleCreateComment = async (content: string, parentId?: string) => {
    await onCreateComment({
      projectId,
      content,
      parentId
    });
  };

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full ${className}`}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comments
            </h3>
            <Badge variant="secondary">
              {comments.length}
            </Badge>
          </div>

          {unresolvedCount > 0 && (
            <div className="text-sm text-orange-600 bg-orange-50 dark:bg-orange-950 p-2 rounded">
              {unresolvedCount} unresolved comment{unresolvedCount > 1 ? 's' : ''}
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'unresolved' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('unresolved')}
            >
              Unresolved
            </Button>
            <Button
              variant={filter === 'resolved' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('resolved')}
            >
              Resolved
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <CommentForm
              onSubmit={handleCreateComment}
              collaborators={collaborators}
              placeholder="Start a new comment thread..."
            />

            <Separator />

            {commentThreads.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {filter === 'all' ? (
                  <div>
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No comments yet</p>
                    <p className="text-xs">Start the conversation!</p>
                  </div>
                ) : (
                  <p>No {filter} comments</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {commentThreads.map(thread => (
                  <CommentItem
                    key={thread.root.id}
                    comment={thread.root}
                    replies={thread.replies}
                    currentUserId={currentUserId}
                    collaborators={collaborators}
                    onReply={handleCreateComment}
                    onUpdate={onUpdateComment}
                    onResolve={onResolveComment}
                    onDelete={onDeleteComment}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}