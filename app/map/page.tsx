import { CampsBrowser } from '@/components/camps-browser';

/**
 * 앱 본체. 지도가 첫 화면. 위치·필터는 클라이언트에서, 공간+패싯 필터는 서버가 한다
 * (3,109건을 통째로 내리지 않고 서버가 조건에 맞는 가까운 ≤200곳만 골라 준다).
 */
export default function MapPage() {
  return <CampsBrowser />;
}
