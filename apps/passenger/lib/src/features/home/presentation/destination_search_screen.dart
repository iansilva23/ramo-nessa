import 'package:flutter/material.dart';
import 'package:ramo_design_system/ramo_design_system.dart';

class DestinationSearchScreen extends StatefulWidget {
  const DestinationSearchScreen({super.key});

  @override
  State<DestinationSearchScreen> createState() => _DestinationSearchScreenState();
}

class _DestinationSearchScreenState extends State<DestinationSearchScreen> {
  final _controller = TextEditingController();

  static const _suggestions = [
    ('Vila de Jericoacoara', 'Jericoacoara, CE'),
    ('Praia do Preá', 'Preá, CE'),
    ('Centro de Jijoca', 'Jijoca de Jericoacoara, CE'),
    ('Aeroporto Regional de Jericoacoara', 'Cruz, CE'),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _controller.text.trim().toLowerCase();
    final visible = _suggestions.where((item) {
      return query.isEmpty ||
          item.$1.toLowerCase().contains(query) ||
          item.$2.toLowerCase().contains(query);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Escolher destino'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(RamoSpacing.md),
          child: Column(
            children: [
              TextField(
                autofocus: true,
                controller: _controller,
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Pra onde vamos?',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
              const SizedBox(height: RamoSpacing.md),
              Expanded(
                child: ListView.separated(
                  itemCount: visible.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final item = visible[index];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: RamoSpacing.xs,
                        vertical: RamoSpacing.xs,
                      ),
                      leading: const CircleAvatar(
                        child: Icon(Icons.place_rounded),
                      ),
                      title: Text(
                        item.$1,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(item.$2),
                      trailing: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
                      onTap: () => Navigator.of(context).pop(item.$1),
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
