import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../map/data/place_search_service.dart';
import '../../map/domain/ramo_place.dart';
import '../data/local_guide_service.dart';

const _yellow = Color(0xFFFFDE00),
    _background = Color(0xFF090B0E),
    _card = Color(0xFF13161B),
    _muted = Color(0xFFB9BDC5);

class _GuideColors {
  const _GuideColors({required this.background, required this.card, required this.muted, required this.body, required this.accent, required this.border});
  final Color background, card, muted, body, accent, border;
  static const dark = _GuideColors(background:_background,card:_card,muted:_muted,body:Color(0xFFDEE0E4),accent:_yellow,border:Color(0xFF42464E));
  static const light = _GuideColors(background:Color(0xFFF5F6F8),card:Colors.white,muted:Color(0xFF596273),body:Color(0xFF283141),accent:Color(0xFF806000),border:Color(0xFFD3D8E0));
}
_GuideColors _guideColors(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? _GuideColors.dark : _GuideColors.light;
IconData guideIcon(String icon) =>
    const <String, IconData>{
      'eco': Icons.eco_outlined,
      'car': Icons.car_crash_outlined,
      'trash': Icons.delete_outline,
      'volume': Icons.volume_off_outlined,
      'pets': Icons.pets_outlined,
      'water': Icons.waves,
      'restaurant': Icons.restaurant,
      'music': Icons.music_note,
      'celebration': Icons.celebration_outlined,
      'tour': Icons.directions_car_outlined,
      'info': Icons.info_outline,
    }[icon] ??
    Icons.explore_outlined;
ThemeData _guideTheme(Brightness brightness) {
  final colors = brightness == Brightness.dark ? _GuideColors.dark : _GuideColors.light;
  return ThemeData(
  useMaterial3: true,
  brightness: brightness,
  scaffoldBackgroundColor: colors.background,
  colorScheme: brightness == Brightness.dark ? const ColorScheme.dark(
    primary: _yellow,
    onPrimary: Colors.black,
    surface: _card,
    onSurface: Colors.white,
    secondary: _card,
    secondaryContainer: _card,
    onSecondary: Colors.white,
    onSecondaryContainer: Colors.white,
  ) : ColorScheme.light(
    primary:colors.accent,onPrimary:Colors.white,
    surface:colors.card,onSurface:const Color(0xFF171C25),
    onSurfaceVariant:colors.muted,secondary:colors.card,
    secondaryContainer:colors.card,onSecondary:const Color(0xFF171C25),
    onSecondaryContainer:const Color(0xFF171C25),outline:colors.border,
  ),
  fontFamily: 'Inter',
);
}

class LocalGuideScreen extends StatefulWidget {
  const LocalGuideScreen({
    super.key,
    required this.service,
    required this.onDestination,
    this.places,
  });
  final LocalGuideService service;
  final PlaceSearchService? places;
  final ValueChanged<RamoPlace> onDestination;
  @override
  State<LocalGuideScreen> createState() => _LocalGuideScreenState();
}

class _LocalGuideScreenState extends State<LocalGuideScreen> {
  GuideCatalog? _catalog;
  String? _locality;
  String _query = '';
  bool _loading = true;
  String? _error;
  bool _searching = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    try {
      final data = await widget.service.load(refresh: refresh);
      if (!mounted) return;
      setState(() {
        _catalog = data;
        _loading = false;
        _error = null;
        final places = data.children(null, 'locality');
        if (!places.any((e) => e.id == _locality)) {
          _locality = places.firstOrNull?.id;
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString().replaceFirst('Bad state: ', '');
        });
      }
    }
  }

  Future<void> _open(GuideEntry entry) async {
    final place = await Navigator.of(context).push<RamoPlace>(
      MaterialPageRoute(
        builder: (_) => GuideCategoryPage(
          category: entry,
          catalog: _catalog!,
          places: widget.places,
        ),
      ),
    );
    if (place != null && mounted) widget.onDestination(place);
  }

  @override
  Widget build(BuildContext context) {
    final catalog = _catalog,
        localities = catalog?.children(null, 'locality') ?? [],
        categories =
            catalog
                ?.children(_locality, 'category')
                .where(
                  (e) => e.name.toLowerCase().contains(_query.toLowerCase()),
                )
                .toList() ??
            [];
    return Theme(
      data: _guideTheme(Theme.of(context).brightness),
      child: Builder(
        builder: (context) => Scaffold(
          backgroundColor: _guideColors(context).background,
          body: SafeArea(
            bottom: false,
            child: RefreshIndicator(
              onRefresh: () => _load(refresh: true),
              color: _guideColors(context).accent,
              child: CustomScrollView(
                key: const PageStorageKey('guide-home'),
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Guia Local',
                                  style: TextStyle(
                                    fontSize: 34,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -1,
                                  ),
                                ),
                              ),
                              IconButton.filledTonal(
                                tooltip: 'Pesquisar categorias',
                                onPressed: () =>
                                    setState(() => _searching = !_searching),
                                icon: const Icon(Icons.search),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Experiências selecionadas pela Ramo Nessa Agência.',
                            style: TextStyle(
                              color: _guideColors(context).muted,
                              fontSize: 14,
                              height: 1.5,
                            ),
                          ),
                          if (_searching)
                            Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: TextField(
                                autofocus: true,
                                decoration: const InputDecoration(
                                  hintText: 'O que você procura?',
                                  prefixIcon: Icon(Icons.search),
                                ),
                                onChanged: (v) => setState(() => _query = v),
                              ),
                            ),
                          const SizedBox(height: 20),
                          if (localities.isNotEmpty)
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  for (final l in localities)
                                    Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: _Pill(
                                        label: l.name,
                                        selected: l.id == _locality,
                                        onTap: () =>
                                            setState(() => _locality = l.id),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          if (catalog?.stale == true)
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Text(
                                'Sem conexão. Exibindo o último conteúdo carregado.',
                                style: TextStyle(color: _guideColors(context).muted, fontSize: 12),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (_loading)
                    SliverFillRemaining(
                      child: Center(
                        child: CircularProgressIndicator(color: _guideColors(context).accent),
                      ),
                    )
                  else if (_error != null)
                    SliverFillRemaining(
                      child: _Empty(
                        title: 'Vamos tentar de novo?',
                        message: _error!,
                        action: () => _load(refresh: true),
                      ),
                    )
                  else if (categories.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _Empty(
                        title: 'Novas descobertas em breve',
                        message: 'As experiências desta localidade aparecerão aqui assim que forem publicadas.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      sliver: SliverLayoutBuilder(
                        builder: (context, constraints) {
                          final wide = constraints.crossAxisExtent > 800;
                          return SliverGrid.builder(
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: wide ? 4 : 2,
                                  mainAxisSpacing: 12,
                                  crossAxisSpacing: 12,
                                  childAspectRatio:
                                      .70 /
                                      MediaQuery.textScalerOf(context)
                                          .scale(1)
                                          .clamp(1.0, 2.5),
                                ),
                            itemCount: categories.length,
                            itemBuilder: (context, index) => _CategoryTile(
                              entry: categories[index],
                              onTap: () => _open(categories[index]),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.entry,
    required this.onTap,
    this.compact = false,
  });
  final GuideEntry entry;
  final VoidCallback onTap;
  final bool compact;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: entry.name,
    child: Material(
      color: _guideColors(context).card,
      borderRadius: BorderRadius.circular(21),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            GuidePhoto(entry: entry),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Color(0x33000000),
                    Color(0xF5000000),
                  ],
                  stops: [0, .35, 1],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (!compact) ...[
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: Colors.black87,
                      child: Icon(
                        guideIcon(entry.text('icon')),
                        color: Colors.white,
                        size: 19,
                      ),
                    ),
                    const SizedBox(height: 9),
                  ],
                  Text(
                    entry.name,
                    maxLines: compact ? 2 : 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: compact ? 14 : 18,
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      height: 1.12,
                    ),
                  ),
                  if (!compact) ...[
                    const SizedBox(height: 5),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Text(
                            entry.summary,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.3,
                              color: Color(0xFFE2E2E5),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.chevron_right, size: 22, color:Colors.white),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class GuideCategoryPage extends StatefulWidget {
  const GuideCategoryPage({
    super.key,
    required this.category,
    required this.catalog,
    this.places,
  });
  final GuideEntry category;
  final GuideCatalog catalog;
  final PlaceSearchService? places;
  @override
  State<GuideCategoryPage> createState() => _GuideCategoryPageState();
}

class _GuideCategoryPageState extends State<GuideCategoryPage> {
  String? _filter;
  bool _busy = false;
  List<GuideEntry> get _items => widget.catalog
      .children(widget.category.id, 'item')
      .where((e) => _filter == null || e.strings('tags').contains(_filter))
      .toList();
  Future<void> _detail(GuideEntry item) async {
    final place = await Navigator.of(context).push<RamoPlace>(
      MaterialPageRoute(
        builder: (_) => GuideItemPage(
          entry: item,
          catalog: widget.catalog,
          places: widget.places,
        ),
      ),
    );
    if (place != null && mounted) Navigator.of(context).pop(place);
  }

  Future<void> _action(GuideEntry e, GuideAction a) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await runGuideAction(
        context,
        e,
        a,
        widget.catalog,
        widget.places,
      );
      if (result != null && mounted) Navigator.of(context).pop(result);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.category,
        items = _items,
        filters = c.strings('filters'),
        featured = items.where((e) => e.featured).toList(),
        other = items.where((e) => !e.featured).toList();
    return Theme(
      data: _guideTheme(Theme.of(context).brightness),
      child: Scaffold(
        backgroundColor: _guideColors(context).background,
        body: SafeArea(
          top: false,
          bottom: true,
          child: CustomScrollView(
            key: PageStorageKey('guide-category-${c.id}'),
            slivers: [
              SliverToBoxAdapter(
                child: _Hero(
                  entry: c,
                  onBack: () => Navigator.of(context).pop(),
                ),
              ),
              if (filters.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Row(
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _Pill(
                              label: 'Todos',
                              selected: _filter == null,
                              onTap: () => setState(() => _filter = null),
                            ),
                          ),
                          for (final f in filters)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _Pill(
                                label: f,
                                selected: _filter == f,
                                onTap: () => setState(() => _filter = f),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (_busy)
                SliverToBoxAdapter(
                  child: LinearProgressIndicator(color: _guideColors(context).accent, minHeight: 2),
                ),
              if (items.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: _Empty(
                    title: 'Em breve, mais experiências',
                    message: 'Estamos preparando os conteúdos desta categoria.',
                  ),
                ),
              if (c.template == 'highlights' && featured.isNotEmpty) ...[
                const SliverToBoxAdapter(
                  child: _SectionTitle('Destaques', Icons.star_rounded),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  sliver: SliverToBoxAdapter(
                    child: _FeaturedCard(
                      entry: featured.first,
                      onTap: () => _detail(featured.first),
                    ),
                  ),
                ),
                if (featured.length > 1)
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 180,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.all(18),
                        itemCount: featured.length - 1,
                        separatorBuilder: (_, __) => const SizedBox(width: 10),
                        itemBuilder: (context, i) => SizedBox(
                          width: 145,
                          child: _CategoryTile(
                            entry: featured[i + 1],
                            compact: true,
                            onTap: () => _detail(featured[i + 1]),
                          ),
                        ),
                      ),
                    ),
                  ),
                if (other.isNotEmpty)
                  const SliverToBoxAdapter(
                    child: _SectionTitle(
                      'Outras experiências',
                      Icons.place_outlined,
                    ),
                  ),
              ],
              if (c.template == 'rules' && items.isNotEmpty)
                const SliverToBoxAdapter(
                  child: _SectionTitle(
                    'Informações importantes',
                    Icons.info_outline,
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
                sliver: SliverList.separated(
                  itemCount: c.template == 'highlights' && featured.isNotEmpty
                      ? other.length
                      : items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final e = (c.template == 'highlights' && featured.isNotEmpty
                        ? other
                        : items)[index];
                    return _ItemCard(
                      entry: e,
                      template: c.template,
                      onTap: () => _detail(e),
                      onAction: (a) => _action(e, a),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.entry, required this.onBack});
  final GuideEntry entry;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) => Stack(
    children: [
      SizedBox(
        height: 300,
        width: double.infinity,
        child: GuidePhoto(entry: entry),
      ),
      const Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x22000000), Color(0x44000000), _background],
              stops: [0, .48, 1],
            ),
          ),
        ),
      ),
      SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: IconButton.filled(
            tooltip: 'Voltar',
            style: IconButton.styleFrom(backgroundColor: Colors.black87),
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(22, 220, 22, 15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              entry.name,
              style: const TextStyle(
                fontSize: 29,
                color: Colors.white,
                fontWeight: FontWeight.w800,
                height: 1.15,
                letterSpacing: -.6,
              ),
            ),
            if (entry.summary.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                entry.summary,
                style: const TextStyle(
                  color: Color(0xFFE0E1E4),
                  height: 1.45,
                  fontSize: 15,
                ),
              ),
            ],
          ],
        ),
      ),
    ],
  );
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({
    required this.entry,
    required this.template,
    required this.onTap,
    required this.onAction,
  });
  final GuideEntry entry;
  final String template;
  final VoidCallback onTap;
  final ValueChanged<GuideAction> onAction;
  @override
  Widget build(BuildContext context) {
    final e = entry, rules = template == 'rules';
    return Material(
      color: _guideColors(context).card,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onTap,
            child: Padding(
              padding: EdgeInsets.all(rules ? 14 : 10),
              child: LayoutBuilder(
                builder: (context, c) {
                  final imageWidth = c.maxWidth < 340 ? 100.0 : 126.0;
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (rules)
                        CircleAvatar(
                          radius: 25,
                          backgroundColor: const Color(0xFF24372B),
                          child: Icon(
                            guideIcon(e.text('icon')),
                            color: Colors.white,
                            size: 28,
                          ),
                        )
                      else
                        SizedBox(
                          width: imageWidth,
                          height: 128,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(15),
                            child: GuidePhoto(entry: e),
                          ),
                        ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (e.text('badge').isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: _Badge(e.text('badge')),
                              ),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    e.name,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      height: 1.2,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.chevron_right,
                                  color: _guideColors(context).muted,
                                  size: 20,
                                ),
                              ],
                            ),
                            if (e.text('duration').isNotEmpty)
                              _Meta(Icons.schedule, e.text('duration')),
                            if (e.text('date').isNotEmpty)
                              _Meta(
                                Icons.calendar_today_outlined,
                                formatGuideDate(e.text('date')),
                              ),
                            if (e.text('address').isNotEmpty)
                              _Meta(Icons.place_outlined, e.text('address')),
                            if (e.text('cuisine').isNotEmpty)
                              _Meta(Icons.restaurant, e.text('cuisine')),
                            if (e.text('schedule').isNotEmpty)
                              _Meta(Icons.schedule, e.text('schedule')),
                            if (e.summary.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  e.summary,
                                  style: TextStyle(
                                    color: _guideColors(context).muted,
                                    fontSize: 12,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            if (e.json['priceCents'] is num)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  guidePrice(e),
                                  style: TextStyle(
                                    color: _guideColors(context).accent,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
          if (e.actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
              child: GuideActionButtons(actions: e.actions, onAction: onAction),
            ),
        ],
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.entry, required this.onTap});
  final GuideEntry entry;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 235,
    child: Material(
      color: _guideColors(context).card,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            GuidePhoto(entry: entry),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0xF4000000)],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (entry.text('badge').isNotEmpty)
                    _Badge(entry.text('badge')),
                  const SizedBox(height: 8),
                  Text(
                    entry.name,
                    style: const TextStyle(
                      fontSize: 23,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    entry.summary,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _muted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class GuideItemPage extends StatefulWidget {
  const GuideItemPage({
    super.key,
    required this.entry,
    required this.catalog,
    this.places,
  });
  final GuideEntry entry;
  final GuideCatalog catalog;
  final PlaceSearchService? places;
  @override
  State<GuideItemPage> createState() => _GuideItemPageState();
}

class _GuideItemPageState extends State<GuideItemPage> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    return Theme(
      data: _guideTheme(Theme.of(context).brightness),
      child: Scaffold(
        backgroundColor: _guideColors(context).background,
        body: SafeArea(
          top: false,
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              _Hero(entry: e, onBack: () => Navigator.of(context).pop()),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 10, 22, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (e.text('duration').isNotEmpty)
                      _Meta(Icons.schedule, e.text('duration')),
                    if (e.text('address').isNotEmpty)
                      _Meta(Icons.place_outlined, e.text('address')),
                    if (e.text('date').isNotEmpty)
                      _Meta(Icons.event, formatGuideDate(e.text('date'))),
                    if (e.text('schedule').isNotEmpty)
                      _Meta(Icons.schedule, e.text('schedule')),
                    if (e.text('cuisine').isNotEmpty)
                      _Meta(Icons.restaurant, e.text('cuisine')),
                    if (e.json['priceCents'] is num)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        child: Text(
                          guidePrice(e),
                          style: TextStyle(
                            color: _guideColors(context).accent,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (e.text('description').isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        child: Text(
                          e.text('description'),
                          style: TextStyle(
                            height: 1.65,
                            fontSize: 15,
                            color: _guideColors(context).body,
                          ),
                        ),
                      ),
                    for (final pair in const [
                      ['highlights', 'Pontos do roteiro'],
                      ['included', 'O que inclui'],
                      ['excluded', 'O que não inclui'],
                    ])
                      if (e.strings(pair[0]).isNotEmpty) ...[
                        Padding(
                          padding: const EdgeInsets.only(top: 16, bottom: 8),
                          child: Text(
                            pair[1],
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        for (final line in e.strings(pair[0]))
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  Icons.check_circle_outline,
                                  size: 16,
                                  color: _guideColors(context).accent,
                                ),
                                const SizedBox(width: 9),
                                Expanded(
                                  child: Text(
                                    line,
                                    style: TextStyle(
                                      color: _guideColors(context).muted,
                                      height: 1.45,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    if (e.text('source').isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 18),
                        child: Text(
                          'Fonte: ${e.text('source')}',
                          style: TextStyle(color: _guideColors(context).muted),
                        ),
                      ),
                    if (e.text('updatedOn').isNotEmpty)
                      Text(
                        'Atualizado em ${formatGuideDate(e.text('updatedOn'))}',
                        style: TextStyle(fontSize: 12, color: _guideColors(context).muted),
                      ),
                    if (e.text('sourceUrl').isNotEmpty)
                      TextButton.icon(
                        onPressed: () => _external(
                          context,
                          Uri.tryParse(e.text('sourceUrl')),
                        ),
                        icon: const Icon(Icons.open_in_new, size: 17),
                        label: const Text('Consultar fonte oficial'),
                      ),
                    const SizedBox(height: 22),
                    if (_busy) LinearProgressIndicator(color: _guideColors(context).accent),
                    IgnorePointer(
                      ignoring: _busy,
                      child: GuideActionButtons(
                        actions: e.actions,
                        onAction: (a) async {
                          if (_busy) return;
                          setState(() => _busy = true);
                          try {
                            final destination = await runGuideAction(
                              context,
                              e,
                              a,
                              widget.catalog,
                              widget.places,
                            );
                            if (destination != null && context.mounted) {
                              Navigator.of(context).pop(destination);
                            }
                          } finally {
                            if (mounted) setState(() => _busy = false);
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GuideActionButtons extends StatelessWidget {
  const GuideActionButtons({
    super.key,
    required this.actions,
    required this.onAction,
  });
  final List<GuideAction> actions;
  final ValueChanged<GuideAction> onAction;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final a in actions)
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 42, maxWidth: 300),
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              backgroundColor: a.primary ? _yellow : Colors.transparent,
              foregroundColor: a.primary ? Colors.black : Theme.of(context).colorScheme.onSurface,
              side: BorderSide(
                color: a.primary ? _yellow : _guideColors(context).border,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
              textStyle: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            onPressed: () => onAction(a),
            icon: Icon(
              const {
                    'route': Icons.near_me,
                    'instagram': Icons.camera_alt_outlined,
                    'whatsapp': Icons.chat_outlined,
                    'website': Icons.open_in_new,
                    'internal': Icons.arrow_forward,
                  }[a.type] ??
                  Icons.link,
              size: 17,
            ),
            label: Text(a.title, softWrap: true, textAlign: TextAlign.center),
          ),
        ),
    ],
  );
}

Future<RamoPlace?> runGuideAction(
  BuildContext context,
  GuideEntry e,
  GuideAction a,
  GuideCatalog catalog,
  PlaceSearchService? places,
) async {
  try {
    if (a.type == 'route') {
      if (!e.validCoordinates) {
        throw StateError('Este lugar ainda não tem localização cadastrada.');
      }
      if (places == null || places is! CoordinatePlaceResolver) {
        throw StateError('Não foi possível abrir o mapa agora.');
      }
      final classified = await (places as CoordinatePlaceResolver)
          .classifyCoordinate(LatLng(e.latitude!, e.longitude!));
      if (classified == null) {
        throw StateError(
          'Este destino está fora da área de atendimento disponível.',
        );
      }
      return RamoPlace(
        name: e.name,
        address: e.text('address').isEmpty
            ? classified.address
            : e.text('address'),
        position: classified.position,
        providerPlaceId: classified.providerPlaceId,
        approvedExternalId: classified.approvedExternalId,
        approvedPricingZoneId: classified.approvedPricingZoneId,
        approvedPricingLocalityId: classified.approvedPricingLocalityId,
        placeProof: classified.placeProof,
        mapPinned: true,
      );
    }
    if (a.type == 'internal') {
      final target = catalog.find(a.targetId);
      if (target == null || target.kind == 'locality') {
        throw StateError('Esta página não está disponível.');
      }
      if (!context.mounted) return null;
      return await Navigator.of(context).push<RamoPlace>(
        MaterialPageRoute(
          builder: (_) => target.kind == 'category'
              ? GuideCategoryPage(
                  category: target,
                  catalog: catalog,
                  places: places,
                )
              : GuideItemPage(entry: target, catalog: catalog, places: places),
        ),
      );
    }
    await _external(context, a.externalUri);
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Bad state: ', '')),
        ),
      );
    }
  }
  return null;
}

Future<void> _external(BuildContext context, Uri? uri) async {
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw StateError('Link indisponível.');
  }
  if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
    throw StateError('Não foi possível abrir esse link.');
  }
}

String formatGuideDate(String raw) {
  final d = DateTime.tryParse(raw);
  return d == null
      ? raw
      : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
}

String guidePrice(GuideEntry e) => [
  e.text('priceLabel'),
  'R\$ ${((e.json['priceCents'] as num) / 100).toStringAsFixed(2).replaceAll('.', ',')}',
  e.text('priceSuffix'),
].where((s) => s.isNotEmpty).join(' ');

class GuidePhoto extends StatelessWidget {
  const GuidePhoto({super.key, required this.entry});
  final GuideEntry entry;
  @override
  Widget build(BuildContext context) {
    final url = entry.imageUrl;
    Widget empty() => ColoredBox(
      color: _guideColors(context).card,
      child: Center(
        child: Icon(
          guideIcon(entry.text('icon')),
          size: 32,
          color: _guideColors(context).muted,
        ),
      ),
    );
    if (url == null) return empty();
    return Image.network(
      url,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      alignment: Alignment(0, entry.imagePosition),
      filterQuality: FilterQuality.medium,
      loadingBuilder: (c, child, progress) =>
          progress == null ? child : empty(),
      errorBuilder: (_, __, ___) => empty(),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => OutlinedButton(
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(72, 44),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      backgroundColor: selected ? _yellow : Colors.transparent,
      foregroundColor: selected ? Colors.black : Theme.of(context).colorScheme.onSurface,
      side: BorderSide(color: selected ? _yellow : _guideColors(context).border),
      textStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
      ),
    ),
    onPressed: onTap,
    child: Text(label),
  );
}

class _Badge extends StatelessWidget {
  const _Badge(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(
      color: _yellow,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(
      text,
      style: const TextStyle(
        color: Colors.black,
        fontSize: 10,
        fontWeight: FontWeight.bold,
      ),
    ),
  );
}

class _Meta extends StatelessWidget {
  const _Meta(this.icon, this.text);
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: _guideColors(context).muted, size: 15),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(color: _guideColors(context).muted, fontSize: 12, height: 1.35),
          ),
        ),
      ],
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, this.icon);
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
    child: Row(
      children: [
        Icon(icon, color: _guideColors(context).accent, size: 23),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.message, this.action});
  final String title, message;
  final VoidCallback? action;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.explore_outlined, color: _guideColors(context).accent, size: 36),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: _guideColors(context).muted, height: 1.5),
          ),
          if (action != null)
            TextButton(
              onPressed: action,
              child: const Text('Tentar novamente'),
            ),
        ],
      ),
    ),
  );
}
