import Modal from '../../components/Modal.jsx';
import { stations } from '../../data/stations.mjs';
import { restrictedEquipmentByStation } from '../../data/restrictedEquipment.mjs';

function ReplacementRules() {
  return (
    <>
      <p className="font-semibold text-slate-950">机器（智巡）替代人工特巡规则</p>
      <ol className="list-decimal space-y-4 pl-5 marker:font-semibold">
        <li>
          <h3 className="font-semibold text-slate-950">强制人工时间节点（一票否决）</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-slate-500">
            <li>1级保电、各级风险预警开始的前 1 日（T-1日），强制要求人工特巡并测温，绝对不得替代（2级保电无需开展前置特巡）。</li>
            <li>连续机器替代期间，220kV变电站每7天内、110kV及以下变电站每14天内，必须强制开展一次人工特巡并测温。</li>
          </ul>
        </li>
        <li>
          <h3 className="font-semibold text-slate-950">GIS 设备与测温豁免</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-slate-500">
            <li><strong>判定条件</strong> · 保电设备中不包含“主变”字样即默认为 GIS 设备。</li>
            <li><strong>测温豁免</strong> · 机器替代期间，针对 GIS 设备不开展红外测温（测温次数设为0）。但若保电设备涉及小营、马台街、新街口等 11 个变电站的主变设备，因具备机器红外测温功能，机器巡视时需正常计算测温次数。</li>
            <li><strong>人工强制测温</strong> · 只要切换为人工特巡，无论设备类型，必须正常开展红外测温。</li>
          </ul>
        </li>
        <li>
          <h3 className="font-semibold text-slate-950">设备动态受限拦截</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-slate-500">
            <li>
              <strong>按本站受限设备清单判定</strong> · 本站设备说明包含下列任一受限特征码时，必须人工巡视并正常测温。未命中时可按后续规则安排机器巡视。
              <p className="mt-1 text-xs text-slate-600">英文字母统一转大写，兼容全半角、空格、“千伏/kV”及罗马数字写法。</p>
              <div className="mt-2 space-y-2">
                {Array.from(restrictedEquipmentByStation, ([name, features]) => (
                  <section key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <h4 className="font-semibold text-slate-950">{name}</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {features.map(feature => <li key={feature}>{feature}</li>)}
                    </ul>
                  </section>
                ))}
              </div>
            </li>
          </ul>
        </li>
      </ol>
    </>
  );
}

function SpecialRules() {
  return (
    <>
      <p className="font-semibold text-slate-950">风险预警与保电巡视频次要求</p>
      <section>
        <h3 className="font-semibold text-slate-950">风险预警 <span className="font-normal text-slate-600">（提前1日均需1巡1测）</span></h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-slate-500">
          <li><strong>5级风险</strong> · 所有涉及变电站，每日开展巡视 2 次、测温 2 次。</li>
          <li><strong>6、7级风险（220kV）</strong> · 每两天开展 1 次巡视和测温。</li>
          <li><strong>6、7级风险（110kV及以下）</strong> · 每三天开展 1 次巡视和测温。</li>
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-slate-950">保电期间 <span className="font-normal text-slate-600">（1级保电提前1日需1巡1测，2级保电不需要）</span></h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-slate-500">
          <li><strong>1级保电</strong> · 所有保电站，每日开展巡视 2 次、测温 2 次。</li>
          <li><strong>2级保电</strong> · 所有保电站，每日开展巡视 1 次、测温 1 次。</li>
        </ul>
      </section>
    </>
  );
}

function ReplacementList() {
  const columns = ['序号', '变电站', '电压等级', '是否可正式运行机器巡视'];

  return (
    <>
      <p>小营变电运维班管辖变电站，共 {stations.length} 站。具体设备的替代条件请参阅「替代巡视规则」。</p>
      <div role="region" aria-label="巡视替代列表表格" tabIndex={0}
        className="overflow-x-auto rounded-xl border border-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
        <table className="review-table w-full min-w-[17.5rem] text-left text-xs sm:min-w-[34rem] sm:text-sm [&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-4 sm:[&_th]:px-4">
          <thead className="border-b border-slate-200 bg-slate-100 text-slate-700">
            <tr className="divide-x divide-slate-200">
              {columns.map(column => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {stations.map(({ name, voltage, canRobot }, index) => (
              <tr key={name} className="divide-x divide-slate-200 odd:bg-white even:bg-slate-50/60">
                <td className="tabular-nums text-slate-500">{index + 1}</td>
                <th scope="row" className="whitespace-nowrap font-medium text-slate-950">{name}</th>
                <td className="tabular-nums">{voltage}</td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${canRobot ? 'bg-teal-50 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>
                    {canRobot ? '可正式运行机器巡视' : '否'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const ruleTopics = [
  { id: 'replacement-rules', title: '替代巡视规则', Content: ReplacementRules },
  { id: 'special-rules', title: '特殊巡视规则', Content: SpecialRules },
  { id: 'replacement-list', title: '巡视替代列表', Content: ReplacementList },
];

export default function RulesModal({ topic, onClose }) {
  const { title, Content } = topic;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4 p-4 text-sm leading-relaxed text-slate-700 sm:p-6">
        <Content />
      </div>
    </Modal>
  );
}
