import {
  Bell,
  Briefcase,
  Eye,
  Filter,
  FlaskConical,
  LayoutDashboard,
  MessageSquareText,
  Newspaper,
  Radar,
  Search,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  phase: number;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, phase: 2 },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase, phase: 1 },
  { href: "/research", label: "Research", icon: Search, phase: 3 },
  { href: "/screener", label: "Screener", icon: Filter, phase: 4 },
  { href: "/opportunities", label: "Opportunities", icon: Radar, phase: 4 },
  { href: "/scenarios", label: "Scenarios", icon: FlaskConical, phase: 6 },
  { href: "/planner", label: "Planner", icon: Target, phase: 6 },
  { href: "/watchlists", label: "Watchlists", icon: Eye, phase: 4 },
  { href: "/alerts", label: "Alerts", icon: Bell, phase: 7 },
  { href: "/brief", label: "Daily Brief", icon: Newspaper, phase: 7 },
  { href: "/ask", label: "Ask My Portfolio", icon: MessageSquareText, phase: 5 },
  { href: "/settings", label: "Settings", icon: Settings, phase: 1 },
];

/** Phase currently delivered; nav items above it show a "soon" marker. */
export const CURRENT_PHASE = 1;
