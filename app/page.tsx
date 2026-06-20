import { Navigation } from '@/components/navigation';
import { DashboardStats } from '@/components/dashboard-stats';

export default function Page() {
  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          <div className="mb-4 sm:mb-8">
            <h1 className="text-xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-xs sm:text-base text-muted-foreground">Bienvenido a tu sistema de gestión de inventario</p>
          </div>
          <DashboardStats />
        </div>
      </main>
    </>
  );
}
