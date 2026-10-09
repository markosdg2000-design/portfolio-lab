# Portfolio Lab v5

**Web publicada:** https://markosdg2000-design.github.io/portfolio-lab/

Plataforma de investigación de posiciones institucionales, cambios trimestrales y fichas de empresas. **No inventa holdings ni precios y no predice rentabilidades.**

## Pantallas

- **Dashboard:** cobertura, estado de ingesta, periodos y ranking de consenso.
- **Gestores:** directorio US/CN/HK y fichas individuales de los diez gestores con posiciones 13F.
- **Empresas:** explorador por emisor, ticker y CUSIP con acceso a ficha.
- **Ficha de empresa:** líneas de negocio editoriales para empresas seleccionadas, fuentes corporativas, holdings por gestor, gráfico, perfil y fundamentales cuando los widgets externos TradingView disponen de cobertura.
- **Cruces:** coincidencias entre dos gestores en el periodo seleccionado.
- **Cambios 13F:** cantidad declarada anterior y actual, variación porcentual de **acciones** —no del precio—, NEW/SOLD/INCREASE/REDUCE.
- **Cartera modelo:** selección heurística, límite máximo real por acción, efectivo residual, enlaces a fichas y exportación CSV.
- **Metodología:** procedencia de datos, retrasos regulatorios y enlaces verificables.

## Procedencia de datos

El formulario 13F original es de la SEC. El sincronizador de producción obtiene holdings estructurados por **13f.info** porque los runners compartidos de GitHub experimentaron bloqueos con SEC; conserva los enlaces originales a cada filing SEC, accession number y CUSIP. Los valores publicados por el intermediario en miles de USD se convierten a USD.

La vista China/Hong Kong contiene enlaces oficiales, pero **no hay colectores automáticos** de holdings para esos mercados.

Los gráficos, fundamental data (como PER, EBITDA cuando estén disponibles), cotizaciones y perfiles ampliados provienen de widgets **TradingView** externos. Estos datos pueden tener fechas, metodología y cobertura distintas al dataset 13F; no se incorporan al feed institucional ni se falsifican si faltan. Si el navegador bloquea scripts de terceros, los enlaces al proveedor permiten continuar la investigación.

## Cómo funciona

1. managers.json configura instituciones e identificadores CIK.
2. La Action programada ejecuta scripts/sync_sec.py.
3. El script escribe data/latest.json y snapshots trimestrales bajo data/history.
4. El frontend app.js agrupa holdings por CUSIP, calcula consenso y compara cantidades entre periodos.
5. GitHub Pages sirve index.html, styles.css, app.js y los JSON de disclosures.

**Precauciones:** los 13F son fotografías retrasadas, no una cartera en tiempo real. No incluyen toda la exposición de un gestor, ni identifican cuándo se negoció cada valor. Splits, enmiendas y diferencias de cobertura pueden afectar al análisis. El score de cartera es heurístico, no una rentabilidad esperada; sus importes en EUR no implican precios de ejecución ni tipos de cambio.

## Pruebas y ejecución local

El despliegue comprueba la sintaxis JavaScript y ejecuta tests Node:

    node --check app.js
    node tests/verify.cjs

Las pruebas cubren límites por valor, suma de pesos y efectivo residual, agrupación por CUSIP, cambio de acciones Q/Q, renderizado de cartera y presencia de pantallas.

Para ejecutar localmente, iniciar un servidor HTTP en la raíz:

    python -m http.server 8000

Visitar http://localhost:8000/ . Abrir index.html con file:// puede impedir la lectura fetch del JSON por política del navegador.

Código: index.html (páginas), styles.css (diseño), app.js (motor frontend), managers.json (universo), scripts/sync_sec.py (ingesta), tests/verify.cjs (tests) y workflows (sincronización/publicación).

**Aviso:** herramienta de investigación financiera, no asesoramiento individual ni instrucciones de inversión.

## Identificación de instrumentos: deuda, acciones y opciones

La pantalla de gestores etiqueta el **instrumento 13F** con su CUSIP y distingue acciones/unidades, opciones, warrants y principal nominal (**PRN**). Una posición PRN puede registrar cero acciones y un principal positivo: el cero no significa que el gestor tenga cero exposición.

`company_symbols.json` contiene correspondencias **verificadas manualmente** entre CUSIP de deuda y el ticker de la **acción ordinaria del emisor** (por ejemplo, Lumentum 55024UAD1 → acción NASDAQ:LITE). El gráfico/ratios TradingView de la acción **no son** cotización/ratios del bono 13F. La ficha incluye una advertencia explícita y enlaza con las fuentes de identificación. Si el ticker no está sustentado, se conserva el CUSIP y se ofrece búsqueda externa, nunca una coincidencia inventada.

Los movimientos 13F se comparan según la magnitud declarada: número de acciones para acciones o **principal nominal para deuda**. Es un cambio de cantidad, no un retorno bursátil. Los tests automatizados incluyen regresiones PRN y una prueba de renderizado de la ficha de Lumentum.
