export const chartHostBindings = {
  class: 'ts-chart-host',
  style: 'position: relative; width: 100%',
  '[style.width.px]': 'options().width',
  '[style.height.px]': 'host.height()',
  '[style.aspect-ratio]':
    'options().height === undefined ? host.layout().aspectRatio : null',
}

export const chartHostTemplate = `
    <div
      #surface
      class="ts-chart-surface"
      style="width: 100%; height: 100%"
    ></div>
    <ng-template #tooltipOutlet />
    <ng-content select="ng-template[tanstackChartTooltipBody]" />
  `
