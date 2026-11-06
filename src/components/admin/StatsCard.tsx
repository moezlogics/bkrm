"use client";

import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  color: "primary" | "success" | "warning" | "danger";
}

const colorMap = {
  primary: {
    bg: "bg-[#6C5CE7]/10",
    text: "text-[#6C5CE7]",
    iconBg: "bg-[#6C5CE7]",
  },
  success: {
    bg: "bg-[#00B894]/10",
    text: "text-[#00B894]",
    iconBg: "bg-[#00B894]",
  },
  warning: {
    bg: "bg-[#FDCB6E]/10",
    text: "text-[#b08d2f]",
    iconBg: "bg-[#FDCB6E]",
  },
  danger: {
    bg: "bg-[#E17055]/10",
    text: "text-[#E17055]",
    iconBg: "bg-[#E17055]",
  },
};

export default function StatsCard({
  label,
  value,
  icon: Icon,
  trend,
  color,
}: StatsCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {trend.value >= 0 ? (
                <TrendingUp className="w-4 h-4 text-[#00B894]" />
              ) : (
                <TrendingDown className="w-4 h-4 text-[#E17055]" />
              )}
              <span
                className={`text-sm font-medium ${
                  trend.value >= 0 ? "text-[#00B894]" : "text-[#E17055]"
                }`}
              >
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-sm text-gray-400">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={`${colors.iconBg} p-3 rounded-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="mt-3 h-8 w-20 bg-gray-200 rounded" />
          <div className="mt-3 h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="h-12 w-12 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}
