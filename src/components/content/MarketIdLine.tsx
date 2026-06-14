interface Props {
  contractTicker: string;
}

export function MarketIdLine({ contractTicker }: Props) {
  return (
    <div className="market-id-line">
      <strong>Market id</strong>
      <code>{contractTicker}</code>
    </div>
  );
}
