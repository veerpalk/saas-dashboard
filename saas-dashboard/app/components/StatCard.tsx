interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "green" | "red" | "purple";
}

const accentMap = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-purple-50 text-purple-600",
};

export default function StatCard({ label, value, sub, accent = "blue" }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-3xl font-bold ${accentMap[accent].split(" ")[1]}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}
