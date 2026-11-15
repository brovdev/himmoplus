import heroAbidjanImg from '../assets/images/hero_abidjan_residence_1794781540154.jpg';
import angreImg from '../assets/images/property_angre_building_1794781541004.jpg';
import cocodyImg from '../assets/images/property_cocody_villa_1794781541287.jpg';
import yopougonImg from '../assets/images/property_yopougon_commercial_1794781541595.jpg';

export const HERO_ABIDJAN_IMAGE = heroAbidjanImg;

export const PROPERTY_IMAGE_PRESETS = [
  { key: 'angre', label: 'Résidence Angré (Immeuble)', src: angreImg },
  { key: 'cocody', label: 'Résidence Cocody (Villa)', src: cocodyImg },
  { key: 'yopougon', label: 'Immeuble Yopougon (Mixte)', src: yopougonImg },
  { key: 'hero', label: 'Résidence Standing Abidjan', src: heroAbidjanImg },
] as const;

export function resolvePropertyImage(photoUrl?: string | null): string {
  if (!photoUrl) return angreImg;
  if (photoUrl.startsWith('data:image/') || photoUrl.startsWith('http://') || photoUrl.startsWith('https://') || photoUrl.startsWith('/')) {
    return photoUrl;
  }
  switch (photoUrl) {
    case 'cocody':
      return cocodyImg;
    case 'yopougon':
      return yopougonImg;
    case 'hero':
      return heroAbidjanImg;
    case 'angre':
    default:
      return angreImg;
  }
}
