import { Link } from "react-router-dom";

import { NavigationItem } from "@/models/NavigationItem";

type NavItemProps = {
  item: NavigationItem;
  currentRoute: string;
};

export const NavItem = ({ item, currentRoute }: NavItemProps): JSX.Element => {
  const Icon = item.icon;
  const activeStateClassName = item.isActive(currentRoute)
    ? "bg-[color:var(--accent-green)] text-white hover:bg-[color:var(--accent-green-hover)]"
    : "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-card-hover)] hover:text-[color:var(--text-primary)]";

  return (
    <Link
      to={item.route}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${activeStateClassName}`}
    >
      <Icon size={16} />
      <span>{item.label}</span>
    </Link>
  );
};
