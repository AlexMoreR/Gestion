"use client";

import { Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  time: string;
};

type NotificationBellProps = {
  items?: NotificationItem[];
  className?: string;
};

export function NotificationBell({ items = [], className }: NotificationBellProps) {
  const count = items.length;
  const badge = count > 99 ? "99+" : String(count);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Notificaciones${count > 0 ? ` (${count})` : ""}`}
          className={cn("relative text-muted-foreground hover:text-foreground", className)}
        >
          <Bell className="size-[1.15rem]" />
          {count > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
              {badge}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {count > 0 ? <span className="text-xs font-normal text-muted-foreground">{count} nuevas</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">No tienes notificaciones</div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} className="flex items-start gap-2 py-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm leading-snug">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
