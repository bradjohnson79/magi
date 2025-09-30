import React from 'react';
import { Star, Download, Shield, Eye, ChevronRight, Clock, Tag } from 'lucide-react';
import { MarketplaceItem } from '@/lib/types/marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  viewMode: 'grid' | 'list';
  isInstalled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onViewDetails: () => void;
  className?: string;
}

export function MarketplaceItemCard({
  item,
  viewMode,
  isInstalled,
  onInstall,
  onUninstall,
  onViewDetails,
  className = ''
}: MarketplaceItemCardProps) {
  const formatInstalls = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const getRuntimeBadgeColor = (runtime?: string) => {
    switch (runtime) {
      case 'nodejs': return 'bg-green-100 text-green-800';
      case 'python': return 'bg-blue-100 text-blue-800';
      case 'docker': return 'bg-purple-100 text-purple-800';
      case 'wasm': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (viewMode === 'list') {
    return (
      <Card className={`hover:shadow-md transition-shadow cursor-pointer ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="flex-shrink-0">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg truncate">{item.name}</h3>
                    {item.verified && (
                      <Shield className="h-4 w-4 text-blue-600" title="Verified" />
                    )}
                    {item.featured && (
                      <Star className="h-4 w-4 text-yellow-500" title="Featured" />
                    )}
                  </div>

                  <p className="text-muted-foreground text-sm line-clamp-2 mb-2">
                    {item.description}
                  </p>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>by {item.authorName}</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current text-yellow-400" />
                      <span>{item.ratingAverage.toFixed(1)}</span>
                      <span>({item.ratingCount})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      <span>{formatInstalls(item.installs)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDistanceToNow(item.createdAt, { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>

                {/* Right Side - Badges and Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {item.type}
                      </Badge>
                      {item.runtime && (
                        <Badge variant="outline" className={`text-xs ${getRuntimeBadgeColor(item.runtime)}`}>
                          {item.runtime}
                        </Badge>
                      )}
                      {item.category && (
                        <Badge variant="outline" className="text-xs">
                          {item.category}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={onViewDetails}>
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>

                      {isInstalled ? (
                        <Button variant="outline" size="sm" onClick={onUninstall}>
                          Uninstall
                        </Button>
                      ) : (
                        <Button size="sm" onClick={onInstall}>
                          Install
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view
  return (
    <Card className={`hover:shadow-lg transition-all duration-200 cursor-pointer ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {item.iconUrl ? (
              <img
                src={item.iconUrl}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold">
                  {item.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <h3 className="font-semibold truncate">{item.name}</h3>
                {item.verified && (
                  <Shield className="h-3 w-3 text-blue-600 flex-shrink-0" title="Verified" />
                )}
                {item.featured && (
                  <Star className="h-3 w-3 text-yellow-500 flex-shrink-0" title="Featured" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">v{item.version}</p>
            </div>
          </div>

          <Badge variant="secondary" className="text-xs">
            {item.type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
          {item.description}
        </p>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {item.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{item.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Runtime Badge */}
        {item.runtime && (
          <div className="mb-4">
            <Badge variant="outline" className={`text-xs ${getRuntimeBadgeColor(item.runtime)}`}>
              {item.runtime}
            </Badge>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-current text-yellow-400" />
            <span>{item.ratingAverage.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span>{formatInstalls(item.installs)}</span>
          </div>
        </div>

        {/* Author */}
        <div className="flex items-center gap-2 mb-4">
          <Avatar className="h-5 w-5">
            <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-xs">
              {item.authorName.charAt(0).toUpperCase()}
            </div>
          </Avatar>
          <span className="text-xs text-muted-foreground truncate">
            {item.authorName}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onViewDetails} className="flex-1">
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>

          {isInstalled ? (
            <Button variant="outline" size="sm" onClick={onUninstall} className="flex-1">
              Uninstall
            </Button>
          ) : (
            <Button size="sm" onClick={onInstall} className="flex-1">
              Install
            </Button>
          )}
        </div>

        {/* Price */}
        {item.price > 0 && (
          <div className="text-center mt-2">
            <span className="text-sm font-semibold">
              ${item.price} {item.currency}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}