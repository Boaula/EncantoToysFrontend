export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  barcode: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Sale {
  id: string;
  date: string;
  total: number;
  items: number;
  paymentMethod: string;
}

export const products: Product[] = [
  { id: '1', name: 'Boneca Princesa Aurora', category: 'Bonecas', price: 89.90, stock: 15, barcode: '7891234567890' },
  { id: '2', name: 'Carrinho Hot Wheels Pack', category: 'Carrinhos', price: 45.50, stock: 32, barcode: '7891234567891' },
  { id: '3', name: 'Lego Friends Casa da Praia', category: 'Blocos', price: 199.90, stock: 8, barcode: '7891234567892' },
  { id: '4', name: 'Quebra-Cabeça 500 Peças', category: 'Quebra-Cabeças', price: 35.90, stock: 25, barcode: '7891234567893' },
  { id: '5', name: 'Pelúcia Urso Ted Grande', category: 'Pelúcias', price: 129.90, stock: 12, barcode: '7891234567894' },
  { id: '6', name: 'Massinha Play-Doh Kit 12', category: 'Massinha', price: 54.90, stock: 28, barcode: '7891234567895' },
  { id: '7', name: 'Action Figure Spider-Man', category: 'Bonecos', price: 79.90, stock: 18, barcode: '7891234567896' },
  { id: '8', name: 'Jogo de Tabuleiro War', category: 'Jogos', price: 149.90, stock: 7, barcode: '7891234567897' },
  { id: '9', name: 'Bicicleta Infantil Aro 16', category: 'Bicicletas', price: 449.90, stock: 5, barcode: '7891234567898' },
  { id: '10', name: 'Patinete 3 Rodas Rosa', category: 'Patinetes', price: 159.90, stock: 3, barcode: '7891234567899' },
  { id: '11', name: 'Pista Hot Wheels Loop Duplo', category: 'Carrinhos', price: 189.90, stock: 9, barcode: '7891234567800' },
  { id: '12', name: 'Barbie Fashionista', category: 'Bonecas', price: 69.90, stock: 22, barcode: '7891234567801' },
  { id: '13', name: 'Nerf Elite Disruptor', category: 'Armas de Brinquedo', price: 119.90, stock: 14, barcode: '7891234567802' },
  { id: '14', name: 'Baby Alive Come e Faz Xixi', category: 'Bonecas', price: 249.90, stock: 6, barcode: '7891234567803' },
  { id: '15', name: 'Slime Kit Faça Você Mesmo', category: 'Slimes', price: 39.90, stock: 45, barcode: '7891234567804' },
];

export const todaySales: Sale[] = [
  { id: 's1', date: '2026-06-20T09:15:00', total: 179.80, items: 2, paymentMethod: 'Cartão Crédito' },
  { id: 's2', date: '2026-06-20T09:42:00', total: 89.90, items: 1, paymentMethod: 'PIX' },
  { id: 's3', date: '2026-06-20T10:20:00', total: 299.70, items: 4, paymentMethod: 'Cartão Débito' },
  { id: 's4', date: '2026-06-20T11:05:00', total: 449.90, items: 1, paymentMethod: 'Dinheiro' },
  { id: 's5', date: '2026-06-20T11:30:00', total: 134.80, items: 3, paymentMethod: 'PIX' },
  { id: 's6', date: '2026-06-20T12:15:00', total: 249.90, items: 1, paymentMethod: 'Cartão Crédito' },
  { id: 's7', date: '2026-06-20T13:40:00', total: 389.70, items: 5, paymentMethod: 'PIX' },
  { id: 's8', date: '2026-06-20T14:10:00', total: 199.90, items: 1, paymentMethod: 'Cartão Débito' },
];

export const getLowStockProducts = () => products.filter(p => p.stock <= 10);

export const getTodayTotal = () => todaySales.reduce((acc, sale) => acc + sale.total, 0);

export const getTodayItemsCount = () => todaySales.reduce((acc, sale) => acc + sale.items, 0);
