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
  // The Studio sidebar only appears once there is enough room for both
  // navigation and a useful working canvas.
  const sidebarWidth = appContentWidth >= 1260 ? 244 : 0;
  return Math.max(0, appContentWidth - sidebarWidth);
}

export type ProfileLayoutMetrics = {
  contentWidth: number;
  desktopProfile: boolean;
  gridWidth: number;
  tileWidth: number;
  widePost: boolean;
  postMediaWidth: number | '100%';
  postMediaHeight: number;
};

export function getProfileLayoutMetrics(
  viewportWidth: number,
  viewportHeight: number,
  insideTabShell: boolean,
): ProfileLayoutMetrics {
  // Use the same exact Lumo shell inset as every other tab screen.
  const contentWidth = getAppContentWidth(viewportWidth, insideTabShell);

  // The profile's desktop identity panel is 320px, plus 24px gap and
  // 48px outer padding. Keep the two-column archive only when it fits.
  const desktopProfile = contentWidth >= 980;
  const gridWidth = desktopProfile
    ? Math.max(0, Math.min(contentWidth, 1440) - 48 - 320 - 24)
    : Math.max(0, Math.min(contentWidth, 1280) - 32);
  const tileWidth = Math.max(0, Math.min(480, (gridWidth - 8) / 2));

  // The web modal can remain inside the tab content host. Use the
  // actual working width after the LUMO navigation rail, not the raw window.
  const postViewportWidth = insideTabShell ? contentWidth : viewportWidth;
  const widePost = postViewportWidth >= 980 && viewportHeight >= 700;
  const compactPostMediaWidth = Math.max(0, Math.min(postViewportWidth - 40, 720));
  const postMediaWidth: number | '100%' = widePost
    ? '100%'
    : compactPostMediaWidth;

  // Compute the wide media stage from the real space left after the details
  // panel, outer gutters and the media panel padding have been reserved.
  const wideLayoutWidth = Math.min(postViewportWidth, 1440);
  const detailsPanelWidth = Math.min(420, Math.max(340, Math.round(wideLayoutWidth * 0.36)));
  const mediaStageWidth = Math.max(280, wideLayoutWidth - 48 - 20 - detailsPanelWidth - 28);
  const postMediaHeight = widePost
    ? Math.max(
        240,
        Math.min(
          640,
          Math.round(viewportHeight - 212),
          Math.round(mediaStageWidth * 1.05),
        ),
      )
    : Math.max(
        180,
        Math.min(
          620,
          Math.round(compactPostMediaWidth * 1.1),
          Math.round(Math.max(0, viewportHeight - 120) * 0.68),
        ),
      );

  return {
    contentWidth,
    desktopProfile,
    gridWidth,
    tileWidth,
    widePost,
    postMediaWidth,
    postMediaHeight,
  };
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
