import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIES, CategoryKey } from "@/lib/air";
import { Lang, tr } from "@/lib/knowledge";

type ChartTooltipPayload = {
  payload?: {
    category?: CategoryKey;
  };
};

export type ForecastChartPoint = {
  time: string;
  label: string;
  aqi: number;
  category: CategoryKey;
};

export function ForecastChart({ data, lang }: { data: ForecastChartPoint[]; lang: Lang }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          interval={5}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={34}
        />
        <ReferenceLine y={200} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            fontSize: 12,
            background: "hsl(var(--popover))",
          }}
          formatter={(v: number, _name, item: ChartTooltipPayload) => {
            const key = item?.payload?.category;
            const label = key && CATEGORIES[key] ? tr(CATEGORIES[key], lang) : "";
            return [label ? `${v} · ${label}` : String(v), "AQI"];
          }}
        />
        <Bar dataKey="aqi" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((p) => (
            <Cell key={p.time} fill={CATEGORIES[p.category].color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
