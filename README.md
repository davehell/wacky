# Divoká kola

Arkádové 3D závody motokár se zvířecími jezdci přímo v prohlížeči. Volně inspirováno DOSovou hrou
Wacky Wheels (1994), ale s moderní grafikou, která vypadá dobře i na velkém monitoru.

Veškerá grafika i zvuk se generují v kódu — žádné obrázky ani nahrávky.

## Spuštění

```
npm install
npm run dev
```

Pak otevři adresu, kterou Vite vypíše (standardně http://localhost:5188).

`npm run build` vytvoří statickou verzi ve složce `dist/`, kterou lze nahrát na jakýkoli hosting
(třeba GitHub Pages).

## Co ve hře je

- šest jezdců — žralok, žirafa, jelen, žabák, zajíček a slonice, každý s jinou rychlostí,
  zrychlením a ovládáním
- Slunečný okruh na tři kola proti pěti soupeřům
- drift s turbem (modré a oranžové jiskry), raketový start
- ježci na trati jako v původní hře: přejetím je sebereš (až 10) a pak je házíš — kutálí se za soupeřem
  před tebou; každý ježek zrovna něco dělá (sedí na záchodě, čte noviny, spí, hraje na kytaru…)
  a činnosti se střídají
- krabice s otazníkem: oheň (tři ohnivé koule), zmrzlina (past za sebe), turbo
- třídy 50 / 100 / 150 cc a dětský režim, minimapa, osobní rekordy
- syntetizovaný zvuk motoru s řazením, motory soupeřů s dopplerovým efektem
- ovládání klávesnicí, gamepadem i dotykem

## Ovládání

| Klávesa              | Akce                                                        |
| -------------------- | ----------------------------------------------------------- |
| ← → / A D            | zatáčení                                                    |
| ↑ ↓ / W S            | plyn, brzda (v dětském režimu jede plyn sám)                |
| Mezerník / Ctrl      | střelba: nejdřív věc z krabice, jinak ježek                 |
| Shift                | drift — drž v zatáčce, puštěním získáš turbo                |
| Esc                  | pauza                                                       |
| M                    | zvuk zapnout / vypnout                                      |

Gamepad: RT plyn, LT brzda, RB drift, X nebo Y střelba.

**Dětský režim** (volba v menu): plyn jede sám, řízení je pomalé a plynulé a jemně drží motokáru
na silnici, soupeři jsou pomalejší. Na dotykové obrazovce zůstanou jen tři velká tlačítka:
doleva, doprava a střílej.

## Nápady na další práci

- další tratě (zasněžená, plážová)
- split-screen pro dva hráče
- mód „Shoot the Duck“ z původní hry
- chytřejší soupeři, kteří se vyhýbají pastím
