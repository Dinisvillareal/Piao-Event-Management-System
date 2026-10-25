import type { LucideIcon } from "lucide-react";
import KpiCard from "./KpiCard";

interface SummaryCardProps {
  value: number;
  title: string;
  gradient: string;
  description: string;
  icon?: LucideIcon;
  onClick?: () => void;
  delay?: number;
}

// Member-portal stat tile -- now the same shared card (look + count-up) the
// staff pages and Reports use.
export default function SummaryCard({ value, title, gradient, description, icon, onClick, delay = 0 }: SummaryCardProps) {
  return <KpiCard value={value} label={title} description={description} icon={icon} gradient={gradient} onClick={onClick} delay={delay} />;
}
