export interface StockImage {
  id: string;
  url: string;
  tags: string[];
}

export interface StockImagePort {
  search(query: string, opts: { count: number; orientation?: 'vertical' | 'horizontal' }): Promise<StockImage[]>;
}
