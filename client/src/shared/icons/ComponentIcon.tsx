import {
  type Icon,
  IconArrowsSplit2,
  IconBolt,
  IconBox,
  IconDatabase,
  IconDoorEnter,
  IconServer,
  IconSettingsAutomation,
  IconStack2,
  IconTable,
  IconUsers,
} from "@tabler/icons-react";

// Catalog icon names (Tabler names, set by the server) to icon components.
const ICONS: Record<string, Icon> = {
  users: IconUsers,
  "arrows-split-2": IconArrowsSplit2,
  "door-enter": IconDoorEnter,
  server: IconServer,
  "settings-automation": IconSettingsAutomation,
  bolt: IconBolt,
  database: IconDatabase,
  table: IconTable,
  "stack-2": IconStack2,
};

export function ComponentIcon(props: { name: string; size?: number; className?: string }) {
  const Component = ICONS[props.name] ?? IconBox;
  return <Component size={props.size ?? 18} stroke={1.6} className={props.className} aria-hidden />;
}
