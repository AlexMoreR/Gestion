"use client";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type Team = {
  name: string;
  plan: string;
};

export function TeamSwitcher({ teams }: { teams: Team[] }) {
  const activeTeam = teams[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ backgroundImage: "linear-gradient(135deg, var(--primary-strong), var(--primary))" }}
          >
            IM
          </span>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]/sidebar:hidden">
            <span className="truncate font-medium">{activeTeam.name}</span>
            <span className="truncate text-xs text-slate-500">{activeTeam.plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
