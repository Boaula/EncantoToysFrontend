import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { getLowStockProducts, getTodayTotal, getTodayItemsCount, todaySales } from "../data/mockData";
import { DollarSign, Package, ShoppingBag, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

export function Dashboard() {
  const todayTotal = getTodayTotal();
  const todayItems = getTodayItemsCount();
  const lowStockProducts = getLowStockProducts();

  const salesByHour = todaySales.reduce((acc, sale) => {
    const hour = new Date(sale.date).getHours();
    const existing = acc.find(item => item.hour === hour);
    if (existing) {
      existing.total += sale.total;
      existing.count += 1;
    } else {
      acc.push({ hour, total: sale.total, count: 1 });
    }
    return acc;
  }, [] as { hour: number; total: number; count: number }[])
  .sort((a, b) => a.hour - b.hour)
  .map(item => ({ ...item, hourLabel: `${item.hour}h` }));

  const paymentMethods = todaySales.reduce((acc, sale) => {
    const existing = acc.find(item => item.method === sale.paymentMethod);
    if (existing) {
      existing.count += 1;
      existing.total += sale.total;
    } else {
      acc.push({ method: sale.paymentMethod, count: 1, total: sale.total });
    }
    return acc;
  }, [] as { method: string; count: number; total: number }[]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1>Dashboard</h1>
        <p className="text-muted-foreground">Visão geral das vendas e estoque</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Dia</CardTitle>
            <DollarSign className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {todayTotal.toFixed(2).replace('.', ',')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.length} transações realizadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Itens Vendidos</CardTitle>
            <ShoppingBag className="w-5 h-5 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{todayItems}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produtos saídos hoje
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="w-5 h-5 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-chart-3">
              R$ {(todayTotal / todaySales.length).toFixed(2).replace('.', ',')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Por transação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Estoque Crítico</CardTitle>
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produtos com baixo estoque
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por Hora</CardTitle>
            <CardDescription>Faturamento ao longo do dia</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={salesByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hourLabel" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Total']}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Line type="monotone" dataKey="total" stroke="#FF6B35" strokeWidth={3} dot={{ fill: '#FF6B35', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Formas de Pagamento</CardTitle>
            <CardDescription>Distribuição por método</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={paymentMethods}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="method" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip 
                  formatter={(value: number) => [`${value} vendas`, 'Quantidade']}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Bar dataKey="count" fill="#00C9A7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Produtos com Estoque Crítico
          </CardTitle>
          <CardDescription>Produtos com 10 unidades ou menos</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStockProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">{product.category}</TableCell>
                  <TableCell className="text-right font-medium">{product.stock} un</TableCell>
                  <TableCell className="text-right">R$ {product.price.toFixed(2).replace('.', ',')}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={product.stock <= 5 ? "destructive" : "secondary"}>
                      {product.stock <= 5 ? "Crítico" : "Baixo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
