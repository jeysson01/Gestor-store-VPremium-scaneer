'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Loader2Icon, TrophyIcon } from 'lucide-react';
import { getPurchaseStats, getTopSuppliers } from '@/lib/actions/purchases';
import { formatSoles } from '@/lib/utils';

type DayPurchaseStat = {
  date: string;
  label: string;
  count: number;
};

const purchasesChartConfig = {
  count: {
    label: 'Compras',
    color: 'var(--chart-1)',
  },
};

type SupplierRank = {
  name: string;
  purchases: number;
  totalSpent: number;
};

export function DashboardStats() {
  const [stats, setStats] = useState<any>(null);
  const [topSuppliers, setTopSuppliers] = useState<SupplierRank[]>([]);
  const [withoutSupplier, setWithoutSupplier] = useState<SupplierRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsResult, suppliersResult] = await Promise.all([
          getPurchaseStats(),
          getTopSuppliers(3),
        ]);

        if (statsResult.success) setStats(statsResult.data);
        if (suppliersResult.success && suppliersResult.data) {
          setTopSuppliers(suppliersResult.data.topSuppliers ?? []);
          setWithoutSupplier(suppliersResult.data.withoutSupplier ?? null);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Compras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPurchases || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Compras registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatSoles(stats?.totalAmount || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Inversión total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Métricas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.purchasesByDay as DayPurchaseStat[] | undefined)?.length ? (
              <ChartContainer config={purchasesChartConfig} className="h-[100px] w-full aspect-auto">
                <BarChart
                  data={stats.purchasesByDay as DayPurchaseStat[]}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={24}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => {
                          const item = payload?.[0]?.payload as DayPurchaseStat | undefined;
                          return item?.label ?? '';
                        }}
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground">Sin compras en los últimos 7 días</p>
            )}
            <p className="text-[10px] text-muted-foreground">Compras registradas por día (últimos 7 días)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrophyIcon className="w-5 h-5" />
            Top 3 proveedores por gasto
          </CardTitle>
          <CardDescription>
            Proveedores con mayor monto total en compras registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay compras con proveedor para mostrar el ranking.
            </p>
          ) : (
            <ol className="space-y-3">
              {topSuppliers.map((supplier, index) => (
                <li
                  key={supplier.name}
                  className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{supplier.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {supplier.purchases} compra{supplier.purchases === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-bold shrink-0">
                    {formatSoles(supplier.totalSpent)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {withoutSupplier && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Compras sin proveedor</CardTitle>
            <CardDescription>
              Registros que no tienen nombre de proveedor asignado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 bg-muted/30">
              <div>
                <p className="font-medium">{withoutSupplier.name}</p>
                <p className="text-xs text-muted-foreground">
                  {withoutSupplier.purchases} compra
                  {withoutSupplier.purchases === 1 ? '' : 's'}
                </p>
              </div>
              <p className="text-lg font-bold shrink-0">
                {formatSoles(withoutSupplier.totalSpent)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
