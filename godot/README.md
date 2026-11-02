# FMG Importer

Addon do Godot que monta um mundo do **Fantasy Cartography** no [Terrain3D](https://github.com/TokisanGames/Terrain3D): relevo em metros, uma textura por bioma, estradas e leitos de rio pintados, rios e estradas como `Path3D`, lagos e mar com água, burgos e marcadores como `Marker3D`, e os dados do mundo (estados, culturas, religiões, espécies, brasões) num recurso para o código do jogo.

Testado com Godot 4.5.1 e Terrain3D 1.1.0.

## Instalação

1. No seu projeto Godot 4.5+, instale o Terrain3D pela Asset Library (ou copie `addons/terrain_3d` da [versão 1.1](https://github.com/TokisanGames/Terrain3D/releases)).
2. Copie a pasta `addons/fmg_importer` desta pasta para o `addons/` do seu projeto.
3. Em **Projeto > Configurações do Projeto > Plugins**, ative **Terrain3D** e **FMG Importer**. Reinicie o editor se o Terrain3D pedir.

Esta pasta também é um projeto pronto: abra `godot/project.godot` depois de copiar o Terrain3D para `godot/addons/terrain_3d`.

## Uso

1. No Fantasy Cartography, abra **Exportar** e clique em **Pacote Godot**. Escolha a área, a largura do mapa de altura, os metros por pixel e a altura do pico mais alto, e baixe o `.zip`.
2. No Godot, use **Projeto > Ferramentas > Import FMG package...** e escolha o `.zip` (ou a pasta descompactada).
3. A cena abre sozinha. Ela fica em `res://fmg/<nome do mundo>/` junto com os dados do terreno e do mundo.

Tamanhos: o Terrain3D aceita até 16 regiões para cada lado da origem; o importador escolhe o tamanho de região que comporta o mapa (2048 px → regiões de 256, 8192 px → 512). Os metros por pixel viram o `vertex_spacing` (até 100).

## No jogo

A raiz da cena é um `FMGWorld` com `data: FMGWorldData`:

```gdscript
var world: FMGWorld = $Aldoria
world.biome_at(player.position)      # { id, name, color, habitability }
world.species_at(player.position)    # espécies do bioma, de fauna_flora.json
world.state_at(player.position)      # o estado cujo território contém a posição
world.area_at("religions", pos)      # idem para provinces, cultures, religions
world.place("Vesper")                # um burgo ou marcador pelo nome
world.emblem("state", 1)             # Texture2D do brasão
```

Cada `Path3D` de rio ou estrada e cada `Marker3D` tem os dados originais em `get_meta("fmg")`.

## Texturas

Cada bioma ocupa uma posição de textura do Terrain3D, tingida com a cor do bioma, seguida de **Road** e **Riverbed**. Troque as texturas lisas pelas suas no painel de Assets do Terrain3D: o mapa de controle já aponta para as posições certas.

## Teste

```sh
godot --headless --path godot --import
godot --headless --path godot --script tests/test_import.gd -- caminho/do/pacote.zip
```
