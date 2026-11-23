export type MarketGridMetrics = {
  columns: number;
  basis: `${number}%`;
  gridWidth: number;
  cardWidth: number;
};

export function getAppContentWidth(viewportWidth: number, insideTabShell: boolean) {
  const shellInset = insideTabShell
    ? viewportWidth >= 1280
      ? 236
      : viewportWidth >= 900
        ? 76
        : 0
    : 0;

  return Math.max(0, viewportWidth - shellInset);
}

export function getStudioBodyWidth(appContentWidth: number) {
  return Math.max(0, appContentWidth - (appContentWidth >= 960 ? 218 : 0));
}

export type SearchGridMetrics = {
  columns: number;
  gridWidth: number;
  cardWidth: number;
};

export function getSearchGridMetrics(
  appContentWidth: number,
  maxWidth = 1180,
  horizontalPadding = 44,
  gap = 14,
): SearchGridMetrics {
  const boundedWidth = Math.min(appContentWidth, maxWidth);
  const gridWidth = Math.max(0, boundedWidth - horizontalPadding);
  const columns = appContentWidth < 340 ? 1 : appContentWidth < 760 ? 2 : appContentWidth < 1180 ? 3 : 4;
  const cardWidth = Math.max(0, (gridWidth - gap * (columns - 1)) / columns);

  return { columns, gridWidth, cardWidth };
}

export function getEventsLayoutMode(_viewportWidth: number, appContentWidth: number) {
  return {
    desktop: appContentWidth >= 980,
    tablet: appContentWidth >= 680,
    compact: appContentWidth < 520,
  };
}

export function getMarketGridMetrics(
  appContentWidth: number,
  maxWidth = 1320,
  horizontalPadding = 18,
  gap = 12,
): MarketGridMetrics {
  const gridWidth = Math.max(0, Math.min(appContentWidth, maxWidth) - horizontalPadding * 2);
  const columns = appContentWidth < 320 ? 1 : appContentWidth < 530 ? 2 : appContentWidth < 900 ? 3 : 4;
  const cardWidth = Math.max(0, (gridWidth - gap * (columns - 1)) / columns);
  const basisValue = gridWidth > 0 ? (cardWidth / gridWidth) * 100 : 0;

  return {
    columns,
    basis: `${basisValue.toFixed(3)}%` as `${number}%`,
    gridWidth,
    cardWidth,
  };
}
