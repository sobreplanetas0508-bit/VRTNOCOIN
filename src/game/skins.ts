export type SkinId = "palhaco" | "coringa" | "gato" | "cachorro" | "superman" | "astronauta" | "ninja" | "robo" | "pirata" | "zumbi" | "rei" | "samurai" | "alien" | "bombeiro" | "galaxia" | "subaru" | "yamal" | "neymar";

export interface SkinInfo {
  id: SkinId;
  name: string;
  /** Coin price. `null` = can only be unlocked with a code. */
  price: number | null;
  description: string;
}

export const SKINS: SkinInfo[] = [
  { id: "palhaco", name: "Palhaço", price: 0, description: "O clássico do picadeiro. Vem de graça." },
  { id: "coringa", name: "Coringa", price: 150, description: "Terno roxo, cabelo verde e um sorriso suspeito." },
  { id: "gato", name: "Gato", price: 300, description: "Ágil, silencioso e sempre cai de pé." },
  { id: "cachorro", name: "Cachorro", price: 500, description: "Orelhas ao vento e muita energia." },
  { id: "superman", name: "Superman", price: null, description: "Não está à venda. Só com código secreto." },
  { id: "astronauta", name: "Astronauta", price: 650, description: "Visual exclusivo astronauta." },
  { id: "ninja", name: "Ninja", price: 750, description: "Visual exclusivo ninja." },
  { id: "robo", name: "Robô", price: 850, description: "Visual exclusivo robô." },
  { id: "pirata", name: "Pirata", price: 950, description: "Visual exclusivo pirata." },
  { id: "zumbi", name: "Zumbi", price: 1050, description: "Visual exclusivo zumbi." },
  { id: "rei", name: "Rei", price: 1200, description: "Visual exclusivo rei." },
  { id: "samurai", name: "Samurai", price: 1350, description: "Visual exclusivo samurai." },
  { id: "alien", name: "Alien", price: 1500, description: "Visual exclusivo alien." },
  { id: "bombeiro", name: "Bombeiro", price: 1650, description: "Visual exclusivo bombeiro." },
  { id: "galaxia", name: "Galáxia", price: 2000, description: "Visual exclusivo galáxia." },
  { id: "subaru", name: "Subaru", price: null, description: "Direto de Re:Zero. Só com código secreto." },
  { id: "yamal", name: "Yamal", price: null, description: "Craque do Barça. Só com código secreto." },
  { id: "neymar", name: "Neymar", price: null, description: "Camisa 10 da Seleção. Só com código secreto." },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

export const LEADERBOARD_SIZE = 25;
